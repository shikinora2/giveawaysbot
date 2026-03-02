# 🚀 Hướng Dẫn Deploy Giveaway Bot Lên VPS Ubuntu

## 📋 Yêu cầu
- VPS Ubuntu 20.04 / 22.04 / 24.04
- Truy cập SSH vào VPS
- Bot Token & Application ID từ [Discord Developer Portal](https://discord.com/developers/applications)

---

## 🔧 Bước 1 — Cài đặt Node.js (v18+) trên VPS

```bash
# Cài Node.js 20 LTS qua NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Kiểm tra phiên bản
node -v   # phải >= v18
npm -v
```

---

## 🔧 Bước 2 — Cài đặt PM2 (Process Manager)

PM2 giúp bot **tự khởi động lại** khi crash và **chạy nền** không cần giữ SSH.

```bash
sudo npm install -g pm2
```

---

## 📂 Bước 3 — Upload code lên VPS

### Cách A: Dùng Git (khuyến nghị)

```bash
# Trên VPS, clone repo của bạn
git clone https://github.com/USERNAME/REPO_NAME.git giveawaybot
cd giveawaybot
```

### Cách B: Dùng SCP từ máy Windows

Chạy lệnh này trên máy Windows (PowerShell):

```powershell
scp -r "d:\Code\giveawaybot" username@YOUR_VPS_IP:/home/username/giveawaybot
```

---

## 🔑 Bước 4 — Tạo file .env trên VPS

```bash
cd ~/giveawaybot
cp .env.example .env
nano .env
```

Điền vào các giá trị:

```
BOT_TOKEN=token_thật_của_bạn_dán_vào_đây
APPLICATION_ID=app_id_thật_của_bạn_dán_vào_đây
```

> **Lưu ý:** Nhấn `Ctrl+X` → `Y` → `Enter` để lưu trong nano.

---

## 📦 Bước 5 — Cài đặt dependencies

```bash
cd ~/giveawaybot
npm install
```

---

## ▶️ Bước 6 — Chạy bot bằng PM2

```bash
# Khởi động bot
pm2 start giveawaysbot.js --name "giveaway-bot"

# Xem log realtime
pm2 logs giveaway-bot

# Xem trạng thái
pm2 status
```

---

## 🔁 Bước 7 — Tự động khởi động khi VPS reboot

```bash
# Tạo startup script
pm2 startup

# Lệnh trên sẽ in ra 1 lệnh sudo, hãy chạy lệnh đó (VD bên dưới)
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Lưu danh sách process hiện tại
pm2 save
```

---

## 🛠️ Lệnh quản lý PM2 thường dùng

| Lệnh | Mô tả |
|------|-------|
| `pm2 status` | Xem trạng thái tất cả bot |
| `pm2 logs giveaway-bot` | Xem log realtime |
| `pm2 restart giveaway-bot` | Khởi động lại bot |
| `pm2 stop giveaway-bot` | Dừng bot |
| `pm2 delete giveaway-bot` | Xóa khỏi PM2 |
| `pm2 monit` | Màn hình giám sát chi tiết |

---

## 🔄 Cập nhật code mới (dùng Git)

```bash
cd ~/giveawaybot
git pull
npm install          # nếu có thêm package mới
pm2 restart giveaway-bot
```

---

## 🌐 Cấu hình Discord Developer Portal

1. Vào [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Chọn ứng dụng của bạn
3. **Bot** → Copy **Token** → Dán vào `BOT_TOKEN` trong `.env`
4. **General Information** → Copy **Application ID** → Dán vào `APPLICATION_ID` trong `.env`
5. **Bot** → Bật các **Privileged Gateway Intents**:
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `PRESENCE INTENT`
   - ✅ `MESSAGE CONTENT INTENT`
6. **OAuth2** → **URL Generator** → Chọn scope `bot` + `applications.commands` → Chọn quyền `Administrator` → Copy link và mời bot vào server

---

## 🔒 Bảo mật .env

```bash
# Chỉ owner mới đọc được file .env
chmod 600 ~/giveawaybot/.env
```

---

## ❓ Gặp lỗi?

- **`Cannot find module 'dotenv'`** → Chạy `npm install` lại
- **`Missing BOT_TOKEN`** → Kiểm tra file `.env` đã điền đúng chưa
- **Slash command không hiện** → Chờ tối đa 1 giờ (global), hoặc restart bot

