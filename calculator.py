# 计算器小程序
def add(x, y):
    return x + y

def subtract(x, y):
    return x - y

def multiply(x, y):
    return x * y

def divide(x, y):
    if y == 0:
        return "错误：除数不能为零"
    return x / y

def main():
    print("=== 简易计算器 ===")
    print("1. 加法")
    print("2. 减法")
    print("3. 乘法")
    print("4. 除法")
    print("0. 退出")
    
    while True:
        choice = input("\n请选择操作 (0-4): ")
        
        if choice == '0':
            print("感谢使用，再见！")
            break
        
        if choice in ['1', '2', '3', '4']:
            try:
                num1 = float(input("请输入第一个数字: "))
                num2 = float(input("请输入第二个数字: "))
                
                if choice == '1':
                    result = add(num1, num2)
                    print(f"{num1} + {num2} = {result}")
                elif choice == '2':
                    result = subtract(num1, num2)
                    print(f"{num1} - {num2} = {result}")
                elif choice == '3':
                    result = multiply(num1, num2)
                    print(f"{num1} * {num2} = {result}")
                elif choice == '4':
                    result = divide(num1, num2)
                    print(f"{num1} / {num2} = {result}")
            except ValueError:
                print("错误：请输入有效的数字")
        else:
            print("无效的选择，请重新输入")

if __name__ == "__main__":
    main()