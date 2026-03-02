require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ComponentType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const ms = require('ms');

// =============================================
//   CẤU HÌNH BOT
// =============================================
const TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const DB_PATH = './giveaways.json';

if (!TOKEN) { console.error('❌ Thiếu BOT_TOKEN trong file .env!'); process.exit(1); }
if (!APP_ID) { console.error('❌ Thiếu APPLICATION_ID trong file .env!'); process.exit(1); }

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// =============================================
//   QUẢN LÝ DATABASE (JSON)
// =============================================
function initDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ counter: 1, active: [], past_winners: [] }, null, 2));
    }
}

function getData() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Lưu collector trong RAM để xử lý nút bấm
const activeCollectors = new Map();

// =============================================
//   KHỞI ĐỘNG BOT & ĐĂNG KÝ SLASH COMMANDS
// =============================================
client.once('ready', async () => {
    initDB();
    console.log(`✅ Bot Giveaway đã sẵn sàng: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Hệ thống quản lý Giveaway')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

            // HELP
            .addSubcommand(sub =>
                sub.setName('help').setDescription('Xem hướng dẫn sử dụng'))

            // START — mở giveaway nhấn nút tham gia
            .addSubcommand(sub =>
                sub.setName('start')
                    .setDescription('Mở giveaway với nút tham gia. Thời gian tự động hoặc Admin tự chốt')
                    .addStringOption(opt =>
                        opt.setName('title').setDescription('Tiêu đề giveaway (do bạn tự đặt)').setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('prize').setDescription('Phần thưởng (do bạn tự điền)').setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('description').setDescription('Mô tả thêm (tuỳ chọn, VD: điều kiện tham gia)').setRequired(false))
                    .addStringOption(opt =>
                        opt.setName('duration')
                            .setDescription('Thời gian tự kết thúc: 10m, 1h, 1d... Để trống = Admin tự chốt')
                            .setRequired(false))
                    .addIntegerOption(opt =>
                        opt.setName('winners').setDescription('Số người thắng (mặc định: 1)').setMinValue(1).setRequired(false)))

            // QUICK — quay ngay lập tức
            .addSubcommand(sub =>
                sub.setName('quick')
                    .setDescription('Quay số ngay lập tức, không cần nút bấm')
                    .addStringOption(opt =>
                        opt.setName('title').setDescription('Tiêu đề').setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('prize').setDescription('Phần thưởng').setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('type').setDescription('Đối tượng lọc').setRequired(true)
                            .addChoices(
                                { name: 'Người đang Online', value: 'active' },
                                { name: 'Theo Role', value: 'role' },
                                { name: 'Danh sách ID tự chọn', value: 'custom' }
                            ))
                    .addRoleOption(opt =>
                        opt.setName('role').setDescription('Chọn role (nếu type = Theo Role)').setRequired(false))
                    .addStringOption(opt =>
                        opt.setName('ids').setDescription('Danh sách ID cách nhau bằng dấu phẩy (nếu type = Custom)').setRequired(false)))

            // END — chốt giải theo ID
            .addSubcommand(sub =>
                sub.setName('end')
                    .setDescription('Chốt giải và công bố người thắng')
                    .addIntegerOption(opt =>
                        opt.setName('id').setDescription('ID giveaway cần chốt (xem bằng /giveaway list)').setRequired(true)))

            // CANCEL — hủy không trao giải
            .addSubcommand(sub =>
                sub.setName('cancel')
                    .setDescription('Hủy giveaway (không trao giải). Để trống ID = hủy TẤT CẢ')
                    .addIntegerOption(opt =>
                        opt.setName('id').setDescription('ID giveaway cần hủy (để trống = hủy tất cả)').setRequired(false)))

            // LIST
            .addSubcommand(sub =>
                sub.setName('list').setDescription('Xem danh sách giveaway đang mở'))

            // HISTORY
            .addSubcommand(sub =>
                sub.setName('history').setDescription('Xem lịch sử người đã trúng giải'))
    ];

    // Đăng ký global (mất tới 1 giờ để hiện trên Discord)
    // Để test nhanh: đổi thành client.application.commands.set(commands, 'GUILD_ID')
    await client.application.commands.set(commands);
    console.log(`✅ Đã đăng ký ${commands.length} slash command(s)`);

    reanimateCollectors();
});

// =============================================
//   XỬ LÝ LỆNH
// =============================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'giveaway') return;

    const sub = interaction.options.getSubcommand();
    let db = getData();

    // ── 1. HELP ──────────────────────────────
    if (sub === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Hướng dẫn Bot Giveaway')
            .setColor('#5865F2')
            .addFields(
                { name: '`/giveaway start`', value: 'Mở giveaway nút bấm. Có thể đặt thời gian tự kết thúc (`10m`,`1h`,`1d`) hoặc để trống để Admin tự chốt bằng `/giveaway end`.' },
                { name: '`/giveaway quick`', value: 'Quay số ngay — lọc Online / Role / ID tùy chọn.' },
                { name: '`/giveaway end [ID]`', value: 'Chốt giải giveaway theo ID (xem ID bằng `/giveaway list`).' },
                { name: '`/giveaway cancel [ID]`', value: 'Hủy giveaway không trao giải. Để trống ID = hủy **tất cả**.' },
                { name: '`/giveaway list`', value: 'Xem danh sách ID đang chạy.' },
                { name: '`/giveaway history`', value: 'Xem lịch sử người đã trúng giải.' }
            )
            .setFooter({ text: 'ID giveaway là số thứ tự: 1, 2, 3...' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── 2. LIST ──────────────────────────────
    if (sub === 'list') {
        if (db.active.length === 0)
            return interaction.reply({ content: '📭 Không có giveaway nào đang chạy.', ephemeral: true });

        const lines = db.active.map(g => {
            const endInfo = g.endTime
                ? `⏰ kết thúc <t:${Math.floor(g.endTime / 1000)}:R>`
                : '🖐 Admin tự chốt';
            return `\`#${g.id}\` **${g.title}** — 🎁 ${g.prize} | 👥 ${g.participants.length} tham gia | ${endInfo}`;
        }).join('\n');

        return interaction.reply({ content: `**📋 Danh sách Giveaway đang chạy:**\n${lines}`, ephemeral: true });
    }

    // ── 3. HISTORY ───────────────────────────
    if (sub === 'history') {
        if (db.past_winners.length === 0)
            return interaction.reply({ content: '📭 Chưa có lịch sử trúng giải.', ephemeral: true });

        const lines = db.past_winners.slice(-20).reverse().map(h =>
            `📅 **${h.date}** | 🆔 #${h.id} | 👤 <@${h.userId}> (${h.username}) | 🎁 **${h.prize}**`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🏆 Lịch Sử Trúng Giải')
            .setColor('#FFD700')
            .setDescription(lines)
            .setFooter({ text: 'Hiển thị 20 lần gần nhất' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── 4. START ──────────────────────────────
    if (sub === 'start') {
        const title        = interaction.options.getString('title');
        const prize        = interaction.options.getString('prize');
        const description  = interaction.options.getString('description') ?? '';
        const durationInput = interaction.options.getString('duration');
        const winnersCount = interaction.options.getInteger('winners') ?? 1;

        const isManual = !durationInput;
        const durationMs = isManual ? 0 : ms(durationInput);

        if (!isManual && !durationMs)
            return interaction.reply({ content: '❌ Thời gian không hợp lệ! Dùng `10m`, `1h`, `2d`...', ephemeral: true });

        const currentID = db.counter++;
        const endTimestamp = isManual ? null : Date.now() + durationMs;

        const embed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY BẮT ĐẦU! 🎉')
            .setColor('#5865F2')
            .addFields(
                { name: '📌 Tiêu đề', value: title, inline: false },
                { name: '🎁 Phần thưởng', value: `**${prize}**`, inline: true },
                { name: '👥 Số người thắng', value: `${winnersCount}`, inline: true },
                { name: '🆔 Mã Giveaway', value: `\`#${currentID}\``, inline: true },
                { name: '⌛ Kết thúc', value: isManual ? '🖐 Admin sẽ chốt thủ công (`/giveaway end ' + currentID + '`)' : `<t:${Math.floor(endTimestamp / 1000)}:R> (<t:${Math.floor(endTimestamp / 1000)}:f>)`, inline: false }
            )
            .setFooter({ text: '👇 Nhấn nút bên dưới để tham gia!' })
            .setTimestamp();

        if (description) embed.setDescription(description);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`gw_join_${currentID}`)
                .setLabel('Tham gia Giveaway!')
                .setEmoji('🎉')
                .setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        db.active.push({
            id: currentID,
            messageId: msg.id,
            channelId: msg.channel.id,
            guildId: msg.guild.id,
            title,
            prize,
            description,
            winnersCount,
            participants: [],   // [{ userId, username, joinedAt }]
            isManual,
            endTime: endTimestamp,
            createdAt: new Date().toLocaleString('vi-VN'),
            createdBy: interaction.user.tag
        });
        saveData(db);

        createBtnCollector(currentID, msg);

        if (!isManual) {
            setTimeout(() => finishGiveaway(currentID, true), durationMs);
        }
        return;
    }

    // ── 5. QUICK ─────────────────────────────
    if (sub === 'quick') {
        await interaction.deferReply();

        const title = interaction.options.getString('title');
        const prize = interaction.options.getString('prize');
        const type  = interaction.options.getString('type');

        const members = await interaction.guild.members.fetch({ withPresences: true });
        let pool;

        if (type === 'active') {
            pool = members.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline');
        } else if (type === 'role') {
            const role = interaction.options.getRole('role');
            if (!role) return interaction.editReply('❌ Bạn chưa chọn role!');
            pool = members.filter(m => !m.user.bot && m.roles.cache.has(role.id));
        } else {
            const rawIds = interaction.options.getString('ids');
            if (!rawIds) return interaction.editReply('❌ Bạn chưa nhập danh sách ID!');
            const ids = rawIds.split(',').map(id => id.trim());
            pool = members.filter(m => ids.includes(m.id));
        }

        const candidates = Array.from(pool.values());
        if (candidates.length === 0)
            return interaction.editReply('❌ Không tìm thấy ai hợp lệ để quay!');

        const winner = candidates[Math.floor(Math.random() * candidates.length)];
        const dateStr = new Date().toLocaleString('vi-VN');
        const db2 = getData();

        // Lưu lịch sử kèm tên
        db2.past_winners.push({
            id: 'QUICK',
            userId: winner.id,
            username: winner.user.tag,
            prize,
            giveawayTitle: title,
            date: dateStr
        });
        saveData(db2);

        const typeLabel = { active: 'Người đang Online', role: 'Theo Role', custom: 'Danh sách ID' };
        const embed = new EmbedBuilder()
            .setTitle('🎊 KẾT QUẢ QUAY SỐ NHANH! 🎊')
            .setColor('#00C851')
            .addFields(
                { name: '📌 Tiêu đề', value: title },
                { name: '🎁 Phần thưởng', value: `**${prize}**`, inline: true },
                { name: '� Chế độ', value: typeLabel[type], inline: true },
                { name: '� Người may mắn', value: `${winner} — \`${winner.user.tag}\``, inline: false }
            )
            .setThumbnail(winner.user.displayAvatarURL())
            .setFooter({ text: `Ngày quay: ${dateStr}` });

        await interaction.editReply({ content: `🎉 Chúc mừng ${winner}!`, embeds: [embed] });
        return;
    }

    // ── 6. END ───────────────────────────────
    if (sub === 'end') {
        const id = interaction.options.getInteger('id');
        await interaction.deferReply({ ephemeral: true });
        const success = await finishGiveaway(id, true);
        return interaction.editReply(
            success ? `✅ Đã chốt và công bố kết quả giveaway \`#${id}\`!` : `❌ Không tìm thấy giveaway \`#${id}\`. Dùng \`/giveaway list\` để kiểm tra.`
        );
    }

    // ── 7. CANCEL ────────────────────────────
    if (sub === 'cancel') {
        const id = interaction.options.getInteger('id');
        await interaction.deferReply({ ephemeral: true });

        if (id !== null) {
            // Hủy 1 giveaway theo ID
            const success = await finishGiveaway(id, false);
            return interaction.editReply(
                success ? `🗑️ Đã hủy giveaway \`#${id}\`.` : `❌ Không tìm thấy giveaway \`#${id}\`.`
            );
        } else {
            // Hủy TẤT CẢ
            const db3 = getData();
            if (db3.active.length === 0)
                return interaction.editReply('📭 Không có giveaway nào đang chạy để hủy.');

            const ids = db3.active.map(g => g.id);
            for (const gId of ids) await finishGiveaway(gId, false);
            return interaction.editReply(`🗑️ Đã hủy **${ids.length}** giveaway: ${ids.map(i => `\`#${i}\``).join(', ')}`);
        }
    }
});

// =============================================
//   HÀM XỬ LÝ NÚT BẤM THAM GIA
// =============================================
function createBtnCollector(id, message) {
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
    activeCollectors.set(id, collector);

    collector.on('collect', async i => {
        const db = getData();
        const gw = db.active.find(g => g.id === id);
        if (!gw) return i.reply({ content: '❌ Giveaway này đã kết thúc!', ephemeral: true });

        const alreadyJoined = gw.participants.some(p => p.userId === i.user.id);
        if (alreadyJoined)
            return i.reply({ content: '⚠️ Bạn đã tham gia giveaway này rồi!', ephemeral: true });

        // Lưu cả userId lẫn username
        gw.participants.push({
            userId: i.user.id,
            username: i.user.tag,
            joinedAt: new Date().toLocaleString('vi-VN')
        });
        saveData(db);

        i.reply({ content: `✅ Đã đăng ký tham gia **Giveaway #${id}**! Chúc bạn may mắn 🍀`, ephemeral: true });
    });
}

// =============================================
//   HÀM KẾT THÚC / HỦY GIVEAWAY
// =============================================
async function finishGiveaway(id, shouldDraw) {
    const db = getData();
    const index = db.active.findIndex(g => g.id === id);
    if (index === -1) return false;

    const gw = db.active[index];
    const channel = await client.channels.fetch(gw.channelId).catch(() => null);
    const message = channel ? await channel.messages.fetch(gw.messageId).catch(() => null) : null;
    const dateStr = new Date().toLocaleString('vi-VN');

    if (shouldDraw) {
        // Xáo trộn & chọn ngẫu nhiên
        const shuffled = [...gw.participants].sort(() => Math.random() - 0.5);
        const winnerEntries = shuffled.slice(0, gw.winnersCount);

        // Lưu lịch sử kèm đầy đủ thông tin
        for (const entry of winnerEntries) {
            db.past_winners.push({
                id,
                userId: entry.userId,
                username: entry.username,
                prize: gw.prize,
                giveawayTitle: gw.title,
                date: dateStr
            });
        }

        const winnerMentions = winnerEntries.length
            ? winnerEntries.map(e => `<@${e.userId}>`).join(', ')
            : '_Không có ai tham gia_';

        const winnerNames = winnerEntries.length
            ? winnerEntries.map(e => `**${e.username}**`).join(', ')
            : '—';

        const resultEmbed = new EmbedBuilder()
            .setTitle('🎁 GIVEAWAY KẾT THÚC!')
            .setColor('#2F3136')
            .addFields(
                { name: '📌 Tiêu đề', value: gw.title },
                { name: '🎁 Phần thưởng', value: gw.prize, inline: true },
                { name: '🆔 Mã Giveaway', value: `\`#${id}\``, inline: true },
                { name: '🏆 Người thắng', value: `${winnerMentions}\n${winnerNames}`, inline: false }
            )
            .setFooter({ text: `Ngày chốt: ${dateStr}` })
            .setTimestamp();

        if (gw.description) resultEmbed.setDescription(gw.description);

        if (message) await message.edit({ embeds: [resultEmbed], components: [] });

        if (winnerEntries.length && channel) {
            await channel.send({
                content: `🎊 Chúc mừng ${winnerMentions} đã trúng giải **${gw.prize}**! 🎉`,
            });
        }
    } else {
        // Hủy
        const cancelEmbed = new EmbedBuilder()
            .setTitle('🚫 GIVEAWAY ĐÃ BỊ HỦY')
            .setDescription(`**${gw.title}** đã bị hủy bởi Quản trị viên.\n🎁 Phần thưởng: ${gw.prize}`)
            .setColor('#FF0000')
            .setFooter({ text: `Hủy lúc: ${dateStr} | ID #${id}` });

        if (message) await message.edit({ embeds: [cancelEmbed], components: [] });
    }

    // Dọn collector
    if (activeCollectors.has(id)) {
        activeCollectors.get(id).stop();
        activeCollectors.delete(id);
    }

    db.active.splice(index, 1);
    saveData(db);
    return true;
}

// =============================================
//   KHÔI PHỤC COLLECTOR KHI BOT RESTART
// =============================================
async function reanimateCollectors() {
    const db = getData();
    for (const gw of db.active) {
        try {
            const channel = await client.channels.fetch(gw.channelId);
            const message = await channel.messages.fetch(gw.messageId);
            createBtnCollector(gw.id, message);

            if (!gw.isManual && gw.endTime) {
                const remaining = gw.endTime - Date.now();
                if (remaining > 0) {
                    setTimeout(() => finishGiveaway(gw.id, true), remaining);
                } else {
                    // Đã quá giờ trong lúc bot offline → chốt ngay
                    finishGiveaway(gw.id, true);
                }
            }
            console.log(`♻️  Đã khôi phục giveaway #${gw.id} — "${gw.title}"`);
        } catch (e) {
            console.warn(`⚠️  Không thể khôi phục giveaway #${gw.id}: ${e.message}`);
        }
    }
}

client.login(TOKEN);