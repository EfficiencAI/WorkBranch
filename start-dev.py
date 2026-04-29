#!/usr/bin/env python3
"""WorkBranch Dev Server - Start/Stop frontend and backend services"""

import argparse
import subprocess
import sys
import os
import time
import platform

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
PORTS_TO_CHECK = [3000, 5173, 5174, 3001]


def run_command(cmd: str, cwd: str = None) -> subprocess.Popen:
    """Run command in background"""
    if platform.system() == "Windows":
        return subprocess.Popen(
            cmd,
            shell=True,
            cwd=cwd,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    else:
        return subprocess.Popen(
            cmd.split(),
            cwd=cwd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )


def kill_process_on_port(port: int) -> bool:
    """Kill process listening on specific port"""
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                ['netstat', '-ano'],
                capture_output=True,
                text=True,
                timeout=5
            )
            for line in result.stdout.split('\n'):
                if f':{port}' in line and 'LISTENING' in line:
                    parts = line.split()
                    pid = parts[-1]
                    try:
                        subprocess.run(
                            ['taskkill', '/F', '/PID', pid],
                            capture_output=True,
                            timeout=5
                        )
                        print(f"  [OK] Killed process on port {port} (PID: {pid})")
                        return True
                    except Exception as e:
                        print(f"  [FAIL] Could not kill PID {pid}: {e}")
        else:
            result = subprocess.run(
                ['lsof', '-t', f'-i:{port}'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.stdout.strip():
                pid = result.stdout.strip()
                try:
                    subprocess.run(['kill', '-9', pid], capture_output=True, timeout=5)
                    print(f"  [OK] Killed process on port {port} (PID: {pid})")
                    return True
                except Exception as e:
                    print(f"  [FAIL] Could not kill PID {pid}: {e}")
    except Exception as e:
        print(f"  [ERROR] Error checking port {port}: {e}")
    return False


def stop_all_processes():
    """Stop all processes on monitored ports"""
    print("[1/3] Stopping existing processes...")
    killed = 0
    for port in PORTS_TO_CHECK:
        if kill_process_on_port(port):
            killed += 1
    if killed == 0:
        print("  No running services found")
    print()


def start_backend():
    """Start backend server"""
    print("[2/3] Starting backend...")
    backend_dir = os.path.join(PROJECT_ROOT, "packages", "backend")
    
    if not os.path.exists(backend_dir):
        print(f"  [ERROR] Backend directory not found: {backend_dir}")
        return
    
    run_command("pnpm run dev", backend_dir)
    print("  [OK] Backend starting... http://localhost:3000")
    print()


def start_frontend():
    """Start frontend dev server"""
    print("[3/3] Starting frontend...")
    frontend_dir = os.path.join(PROJECT_ROOT, "packages", "frontend")
    
    if not os.path.exists(frontend_dir):
        print(f"  [ERROR] Frontend directory not found: {frontend_dir}")
        return
    
    run_command("pnpm run dev", frontend_dir)
    print("  [OK] Frontend starting... http://localhost:5173")
    print()


def main():
    parser = argparse.ArgumentParser(description="WorkBranch Dev Server")
    parser.add_argument("--backend-only", action="store_true", help="Start only backend")
    parser.add_argument("--frontend-only", action="store_true", help="Start only frontend")
    args = parser.parse_args()

    print("=" * 40)
    print("  WorkBranch Dev Server")
    print("=" * 40)
    print()

    stop_all_processes()

    if not args.frontend_only:
        start_backend()

    if not args.backend_only:
        start_frontend()

    print("=" * 40)
    print("  Done!")
    if not args.frontend_only:
        print("  - Backend: http://localhost:3000")
    if not args.backend_only:
        print("  - Frontend: http://localhost:5173")
    print()
    print("  Usage:")
    print("  python start-dev.py              # Start all")
    print("  python start-dev.py --backend-only   # Backend only")
    print("  python start-dev.py --frontend-only  # Frontend only")
    print("=" * 40)


if __name__ == "__main__":
    main()
