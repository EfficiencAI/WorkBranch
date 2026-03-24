"""
聊天线端到端测试运行脚本

使用方式:
    python run_tests.py
"""

import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime


def main():
    test_dir = Path(__file__).parent / "WorkBranch" / "backend" / ".test"
    
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"test_chat_e2e_{timestamp}.log"
    
    print(f"测试日志文件: {log_file}")
    print("=" * 80)
    
    command = [
        sys.executable,
        "-m",
        "pytest",
        str(test_dir),
        "-v",
        "-s"
    ]
    
    with open(log_file, "w", encoding="utf-8") as f:
        f.write(f"测试开始时间: {datetime.now().isoformat()}\n")
        f.write("=" * 80 + "\n\n")
        
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        
        f.write(result.stdout)
        
        f.write("\n" + "=" * 80 + "\n")
        f.write(f"返回码: {result.returncode}\n")
        f.write(f"测试结束时间: {datetime.now().isoformat()}\n")
    
    print("\n" + "=" * 80)
    print(f"测试完成！日志已保存至: {log_file}")
    print(f"返回码: {result.returncode}")
    
    print("\n" + "=" * 80)
    print("测试输出:")
    print("=" * 80)
    print(result.stdout)


if __name__ == "__main__":
    main()
