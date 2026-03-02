# 🎉 Discord Giveaway Bot


Bot Discord quản lý Giveaway với hệ thống nút bấm tham gia, quay số nhanh và lưu trữ lịch sử người thắng.

---

## ✨ Tính năng

| Lệnh | Mô tả |
|------|-------|
| `/giveaway start` | Tạo giveaway có nút bấm tham gia, hỗ trợ đếm ngược hoặc chốt thủ công |
| `/giveaway quick` | Quay số ngay lập tức, lọc theo Online / Role / Danh sách ID |
| `/giveaway end [ID]` | Chốt giải và công bố người thắng |
| `/giveaway cancel [ID]` | Hủy giveaway (không trao giải) |
| `/giveaway list` | Xem danh sách giveaway đang chạy |
| `/giveaway history` | Xem lịch sử người đã trúng giải |
| `/giveaway help` | Xem hướng dẫn sử dụng |

---

## 🗂️ Cấu trúc project

```
giveawaybot/
├── giveawaysbot.js   # File chính của bot
├── giveaways.json    # Database JSON lưu giveaway
├── package.json
├── .env              # Token & App ID (KHÔNG commit lên Git)
└── .env.example      # File mẫu cấu hình
```

---

## 🌐 Cấu hình Discord Developer Portal

1. Vào [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Tạo ứng dụng mới hoặc chọn ứng dụng có sẵn
3. **Bot** → Copy **Token**
4. **General Information** → Copy **Application ID**
5. **Bot** → Bật các **Privileged Gateway Intents**:
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `PRESENCE INTENT`
   - ✅ `MESSAGE CONTENT INTENT`
6. **OAuth2 → URL Generator** → Chọn scope `bot` + `applications.commands` → Quyền `Administrator` → Copy link mời bot vào server

---

## 🚀 Hướng Dẫn Setup Trên VPS Ubuntu

### 📋 Yêu cầu

- VPS Ubuntu 20.04 / 22.04 / 24.04
- Quyền truy cập SSH

---

### Bước 1 — Cài đặt Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Kiểm tra phiên bản (phải >= v18)
node -v
npm -v
```

---

### Bước 2 — Cài đặt PM2

PM2 giúp bot **tự khởi động lại** khi crash và **chạy nền** không cần giữ SSH.

```bash
sudo npm install -g pm2
```

---

### Bước 3 — Clone repo

```bash
git clone https://github.com/shikinora2/giveawaysbot.git
cd giveawaysbot
```

---

### Bước 4 — Tạo file `.env`

```bash
cp .env.example .env
nano .env
```

Điền token và App ID vào file:

```env
BOT_TOKEN=token_cua_ban_dan_vao_day
APPLICATION_ID=app_id_cua_ban_dan_vao_day
```

> 💡 Nhấn `Ctrl+X` → `Y` → `Enter` để lưu trong nano.

Bảo mật file `.env`:

```bash
chmod 600 .env
```

---

### Bước 5 — Cài đặt dependencies

```bash
npm install
```

---

### Bước 6 — Chạy bot bằng PM2

```bash
# Khởi động bot
pm2 start giveawaysbot.js --name "giveaway-bot"

# Xem log realtime
pm2 logs giveaway-bot

# Xem trạng thái
pm2 status
```

---

### Bước 7 — Tự động khởi động khi VPS reboot

```bash
# Tạo startup script (chạy lệnh sudo mà terminal in ra)
pm2 startup

# Lưu danh sách process
pm2 save
```

---

## 🛠️ Lệnh PM2 thường dùng

| Lệnh | Mô tả |
|------|-------|
| `pm2 status` | Xem trạng thái tất cả process |
| `pm2 logs giveaway-bot` | Xem log realtime |
| `pm2 restart giveaway-bot` | Khởi động lại bot |
| `pm2 stop giveaway-bot` | Dừng bot |
| `pm2 delete giveaway-bot` | Xóa khỏi PM2 |
| `pm2 monit` | Màn hình giám sát chi tiết |

---

## 🔄 Cập nhật code mới

```bash
cd ~/giveawaysbot
git pull
npm install
pm2 restart giveaway-bot
```

---

## ❓ Xử lý lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|-----------|
| `Cannot find module 'dotenv'` | Chạy `npm install` lại |
| `Missing BOT_TOKEN` | Kiểm tra file `.env` đã điền đúng chưa |
| Slash command không hiện trên Discord | Chờ tối đa 1 giờ (global commands) hoặc restart bot |
| Bot offline ngay sau khi start | Chạy `pm2 logs giveaway-bot` để xem lỗi chi tiết |
