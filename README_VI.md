# Web Quản Lý Tiến Độ Công Trình

Project web quản lý cho Current Service, dùng chung Supabase với app Flutter hiện tại.

## Công nghệ

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase Database/Auth/Storage
- Giao diện desktop gần phong cách trang quản lý thời gian hiện tại của công ty

## Chức năng đã có

### Đăng nhập

- Đăng nhập bằng mã nhân viên + PIN 4 số giống app Flutter.
- Hỗ trợ tài khoản cũ dùng raw `0000`.
- Nếu mã nhân viên đã tồn tại nhưng chưa có Auth account, PIN `0000` sẽ gọi Edge Function `activate-employee-account` để kích hoạt lần đầu.
- Chỉ `admin` và `editor` được vào web.
- Nếu `must_change_password = true`, bắt buộc đổi PIN trước khi vào quản lý.

### Dashboard

- Tổng số công trình.
- Số công trình đang làm.
- Số công trình chờ xác nhận.
- Số công trình đang giữ.
- Số nhân viên active với admin.
- Bảng tổng quan công trình và tiến độ.

### Công trình

- Xem danh sách công trình.
- Thêm công trình mới.
- Tạo tự động 15工程 mặc định giống app Flutter.
- Sửa tên và mô tả công trình.
- Xóa mềm công trình.
- Xem tiến độ và工程 hiện tại.

### Chi tiết công trình

- Tab 工程管理.
- Tab 資料.
- Tab 履歴.
- Thêm/sửa/xóa工程.
- Sửa trạng thái, người phụ trách, ボール持ち, ngày dự kiến, ngày bắt đầu, ngày hoàn thành, ghi chú, nội dung chi tiết.
- Upload PDF lên Supabase Storage `project-files`.
- Mở file bằng signed URL.
- Xóa file khỏi DB + Storage.
- Xem `update_logs`.

### Nhân viên

Chỉ admin truy cập:

- Danh sách nhân viên.
- Sửa tên nhân viên.
- Viewer ↔ Editor.
- Khóa/mở lại nhân viên.
- Reset PIN về `0000`.
- Tạo nhân viên mới bằng Edge Function `admin-create-employee`.

## Cấu hình Supabase

Project đã có sẵn file `.env.local` trỏ tới Supabase hiện tại của app.

Biến môi trường:

```env
NEXT_PUBLIC_SUPABASE_URL=https://brezatdpealwghsmfbmc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Không đưa `service_role` hoặc secret key vào project web.

## Điều kiện Supabase cần có

Database cần đã chạy các migration hiện tại của app, gồm các RPC chính:

- `lookup_login_email_by_employee_code`
- `get_my_employee_profile`
- `mark_own_password_changed`
- `admin_update_employee_name`
- `admin_set_employee_role`
- `admin_deactivate_employee`
- `admin_reactivate_employee`

Edge Functions cần deploy:

```powershell
npx supabase functions deploy activate-employee-account --no-verify-jwt
npx supabase functions deploy admin-create-employee
npx supabase functions deploy admin-reset-password
```

## Chạy local trên Windows

Mở PowerShell tại thư mục project:

```powershell
npm install
npm run dev
```

Mở:

```text
http://localhost:3000
```

Build production:

```powershell
npm run build
npm start
```

## Kiểm tra đã thực hiện

Project đã chạy thành công:

```text
npm run lint
npm run build
npm start
```

và route `/login` trả HTTP 200 trên production server local.

## Cơ chế lưu dữ liệu

Không cần nút đồng bộ riêng.

- Nhập form nhưng chưa bấm 保存/追加: chưa ghi Supabase.
- Bấm 保存/追加/削除: ghi trực tiếp Supabase ngay.
- PDF upload: gửi trực tiếp Supabase Storage và tạo metadata trong `documents`.
- App Flutter và web nhìn cùng dữ liệu vì dùng chung project Supabase.

## Deploy lên Vercel

1. Đưa project lên GitHub.
2. Import repository vào Vercel.
3. Thêm 2 biến môi trường:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Deploy.

## Lưu ý

Project này đã bỏ hoàn toàn fake repository. Web chỉ dùng Supabase thật.
