import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


def print_line(message: str, *, stream: str = "stdout") -> None:
    target = sys.stderr if stream == "stderr" else sys.stdout
    target.buffer.write((message + "\n").encode(target.encoding or "utf-8", errors="replace"))
    target.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start frontend and backend dev servers.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--backend-port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=5173)
    parser.add_argument("--backend-only", action="store_true")
    parser.add_argument("--frontend-only", action="store_true")
    parser.add_argument("--no-reload", action="store_true")
    args = parser.parse_args()

    if args.backend_only and args.frontend_only:
        parser.error("--backend-only and --frontend-only cannot be used together.")

    return args


def resolve_python(workspace_root: Path) -> str:
    candidates = [
        workspace_root / ".venv" / "Scripts" / "python.exe",
        workspace_root / ".venv" / "bin" / "python",
        Path(sys.executable),
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise RuntimeError("Python executable not found.")


def resolve_npm() -> str:
    commands = ["npm.cmd", "npm"] if os.name == "nt" else ["npm"]

    for command in commands:
        resolved = shutil.which(command)
        if resolved:
            return resolved

    raise RuntimeError("npm command not found in PATH.")


def stream_output(name: str, process: subprocess.Popen[str]) -> None:
    assert process.stdout is not None

    for line in process.stdout:
        print_line(f"[{name}] {line.rstrip()}")


def ensure_backend_runtime(python_executable: str) -> None:
    command = [python_executable, "-c", "import uvicorn"]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            "uvicorn is not installed in the selected Python environment. Install dependencies with `pip install -r requirements.txt`."
        )


def start_process(name: str, command: list[str], cwd: Path) -> tuple[subprocess.Popen[str], threading.Thread]:
    kwargs: dict[str, object] = {
        "cwd": str(cwd),
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }

    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True

    process = subprocess.Popen(command, **kwargs)
    thread = threading.Thread(target=stream_output, args=(name, process), daemon=True)
    thread.start()
    return process, thread


def stop_process(name: str, process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    try:
        if os.name == "nt":
            try:
                process.send_signal(signal.CTRL_BREAK_EVENT)
            except OSError:
                process.terminate()
        else:
            process.terminate()

        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        print_line(f"[{name}] force killing process")
        process.kill()
        process.wait(timeout=5)


def get_health_check_host(host: str) -> str:
    if host in {"0.0.0.0", "::"}:
        return "127.0.0.1"
    return host


def wait_for_backend_health(host: str, port: int, process: subprocess.Popen[str], timeout: float = 20.0) -> bool:
    health_host = get_health_check_host(host)
    url = f"http://{health_host}:{port}/health"
    deadline = time.time() + timeout

    while time.time() < deadline:
        if process.poll() is not None:
            return False

        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return True
        except URLError:
            pass

        time.sleep(0.5)

    return False


def main() -> int:
    args = parse_args()
    root_dir = Path(__file__).resolve().parent
    workspace_root = root_dir.parent
    backend_dir = root_dir / "backend"
    frontend_dir = root_dir / "frontend"

    if not args.frontend_only and not backend_dir.is_dir():
        raise RuntimeError(f"Backend directory not found: {backend_dir}")

    if not args.backend_only and not frontend_dir.is_dir():
        raise RuntimeError(f"Frontend directory not found: {frontend_dir}")

    processes: list[tuple[str, subprocess.Popen[str], threading.Thread]] = []
    backend_process: subprocess.Popen[str] | None = None

    try:
        if not args.frontend_only:
            python_executable = resolve_python(workspace_root)
            ensure_backend_runtime(python_executable)
            backend_command = [
                python_executable,
                "-m",
                "uvicorn",
                "app:app",
                "--host",
                args.host,
                "--port",
                str(args.backend_port),
            ]
            if not args.no_reload:
                backend_command.append("--reload")

            print_line(f"[launcher] starting backend in {backend_dir}")
            backend_process, backend_thread = start_process("backend", backend_command, backend_dir)
            processes.append(("backend", backend_process, backend_thread))

        if not args.backend_only:
            npm_command = resolve_npm()
            frontend_command = [
                npm_command,
                "run",
                "dev",
                "--",
                "--host",
                args.host,
                "--port",
                str(args.frontend_port),
            ]
            print_line(f"[launcher] starting frontend in {frontend_dir}")
            processes.append(("frontend", *start_process("frontend", frontend_command, frontend_dir)))

        if not processes:
            print_line("[launcher] nothing to start")
            return 0

        if not args.frontend_only:
            print_line(f"[launcher] backend expected at http://{args.host}:{args.backend_port}")
        if not args.backend_only:
            print_line(f"[launcher] frontend expected at http://{args.host}:{args.frontend_port}")

        if backend_process is not None and not args.backend_only:
            health_host = get_health_check_host(args.host)
            print_line(f"[launcher] checking backend health at http://{health_host}:{args.backend_port}/health")
            if wait_for_backend_health(args.host, args.backend_port, backend_process):
                print_line(f"[launcher] backend health check passed at http://{health_host}:{args.backend_port}/health")
            else:
                print_line(f"[launcher] backend health check did not pass within timeout at http://{health_host}:{args.backend_port}/health")

        print_line("[launcher] press Ctrl+C to stop all services")

        while True:
            for name, process, _ in processes:
                return_code = process.poll()
                if return_code is not None:
                    if return_code == 0:
                        print_line(f"[launcher] {name} exited")
                    else:
                        print_line(f"[launcher] {name} exited with code {return_code}")
                    return return_code
            time.sleep(0.5)
    except KeyboardInterrupt:
        print_line("[launcher] stopping services")
        return 0
    finally:
        for name, process, _ in reversed(processes):
            stop_process(name, process)

        for _, _, thread in processes:
            thread.join(timeout=1)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print_line(f"[launcher] {error}", stream="stderr")
        raise SystemExit(1)
