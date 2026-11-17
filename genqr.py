import cv2
import cv2.aruco as aruco
import os

# Tạo thư mục xuất ảnh
output_dir = "QR_In_Chieu_Nay"
os.makedirs(output_dir, exist_ok=True)

# 1. Khai báo từ điển CHUẨN: ArUco 5x5_100
try:
    aruco_dict = aruco.getPredefinedDictionary(aruco.DICT_5X5_100)
    generate_marker = aruco.generateImageMarker
except AttributeError: # Tương thích OpenCV cũ
    aruco_dict = aruco.Dictionary_get(aruco.DICT_5X5_100)
    generate_marker = aruco.drawMarker

# 2. Cấu hình thông số mã
MARKER_SIZE_PX = 400  # Kích thước lõi mã (pixel)
PADDING_PX = 50       # Viền trắng an toàn xung quanh (pixel)

# 3. Tạo mã cho 6 XE (ID chuẩn từ 1 đến 6)
robot_ids = [1, 2, 3, 4, 5, 6]
print("Đang tạo mã ArUco cho 6 Robot...")
for marker_id in robot_ids:
    marker_image = generate_marker(aruco_dict, marker_id, MARKER_SIZE_PX)
    
    # Thêm viền trắng bao quanh (giữ nguyên logic rất hay của bạn)
    marker_with_border = cv2.copyMakeBorder(
        marker_image, top=PADDING_PX, bottom=PADDING_PX, left=PADDING_PX, right=PADDING_PX, 
        borderType=cv2.BORDER_CONSTANT, value=[255, 255, 255]
    )

    file_name = os.path.join(output_dir, f"Robot_ID_{marker_id:02d}.png")
    cv2.imwrite(file_name, marker_with_border)
    print(f" -> Đã tạo: {file_name}")

# 4. Tạo mã cho 4 GÓC BÀN CỜ (ID 90, 91, 92, 93)
board_ids = [90, 91, 92, 93]
print("\nĐang tạo mã ArUco cho 4 góc bàn cờ...")
for marker_id in board_ids:
    marker_image = generate_marker(aruco_dict, marker_id, MARKER_SIZE_PX)
    
    marker_with_border = cv2.copyMakeBorder(
        marker_image, top=PADDING_PX, bottom=PADDING_PX, left=PADDING_PX, right=PADDING_PX, 
        borderType=cv2.BORDER_CONSTANT, value=[255, 255, 255]
    )

    file_name = os.path.join(output_dir, f"Board_Corner_ID_{marker_id}.png")
    cv2.imwrite(file_name, marker_with_border)
    print(f" -> Đã tạo: {file_name}")

print(f"\nHoàn tất! Tất cả các file ảnh đã nằm trong thư mục '{output_dir}'.")