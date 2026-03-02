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
    ButtonStyle,
    Collection
} = require('discord.js');
const fs = require('fs');
const ms = require('ms');

// --- CẤU HÌNH BOT ---
const TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const DB_PATH = './giveaways.json';

if (!TOKEN) {
    console.error('❌ Thiếu BOT_TOKEN trong file .env!');
    process.exit(1);
}
if (!APP_ID) {
    console.error('❌ Thiếu APPLICATION_ID trong file .env!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- QUẢN LÝ DỮ LIỆU (JSON) ---
function initDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ counter: 1, active: [], past_winners: [] }, null, 2));
    }
}

function getData() {
    return JSON.parse(fs.readFileSync(DB_PATH));
}

function saveData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Lưu trữ Collector trong bộ nhớ để tương tác nút bấm
const activeCollectors = new Map();

client.once('ready', async () => {
    initDB();
    console.log(`✅ Bot Giveaway đã sẵn sàng: ${client.user.tag}`);

    // Đăng ký Slash Commands
    const commands = [
        new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Hệ thống quản lý Giveaway')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addSubcommand(sub => 
                sub.setName('help').setDescription('Xem hướng dẫn sử dụng'))
            .addSubcommand(sub =>
                sub.setName('start')
                    .setDescription('Bắt đầu Giveaway có nút bấm (Tham gia chủ động)')
                    .addStringOption(opt => opt.setName('title').setDescription('Tiêu đề').setRequired(true))
                    .addStringOption(opt => opt.setName('prize').setDescription('Phần thưởng').setRequired(true))
                    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian (10m, 1h) hoặc "manual"').setRequired(true))
                    .addIntegerOption(opt => opt.setName('winners').setDescription('Số người thắng').setMinValue(1).setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('quick')
                    .setDescription('Quay thưởng ngay lập tức (Không cần nhấn nút)')
                    .addStringOption(opt => opt.setName('title').setDescription('Tiêu đề').setRequired(true))
                    .addStringOption(opt => opt.setName('type').setDescription('Đối tượng lọc').setRequired(true)
                        .addChoices(
                            { name: 'Người đang Online', value: 'active' },
                            { name: 'Theo Role', value: 'role' },
                            { name: 'Danh sách ID tự chọn', value: 'custom' }
                        ))
                    .addStringOption(opt => opt.setName('prize').setDescription('Phần thưởng').setRequired(true))
                    .addRoleOption(opt => opt.setName('role').setDescription('Nếu chọn type là Role'))
                    .addStringOption(opt => opt.setName('ids').setDescription('Nếu chọn type là Custom (ID1, ID2,...)')))
            .addSubcommand(sub =>
                sub.setName('end')
                    .setDescription('Kết thúc và chốt giải Giveaway theo ID')
                    .addIntegerOption(opt => opt.setName('id').setDescription('Mã số ID của giveaway').setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('cancel')
                    .setDescription('Hủy bỏ giveaway (Không trao giải)')
                    .addIntegerOption(opt => opt.setName('id').setDescription('Nhập ID để hủy 1 cái, để trống để hủy TẤT CẢ')))
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('Danh sách giveaway đang hoạt động'))
            .addSubcommand(sub =>
                sub.setName('history')
                    .setDescription('Lịch sử người đã trúng giải'))
    ];

    // Đăng ký slash commands toàn cầu (mất ~1 giờ để cập nhật)
    // Nếu muốn test nhanh hơn, đổi thành: client.application.commands.set(commands, 'GUILD_ID_CỦA_BẠN')
    const rest = client.application;
    await rest.commands.set(commands);
    console.log(`✅ Đã đăng ký ${commands.length} slash command(s)`);

    // Tái khởi động các Collector cho những giveaway đang chạy (nếu bot restart)
    reanimateCollectors();
});

// --- LOGIC XỬ LÝ LỆNH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'giveaway') return;

    const subcommand = interaction.options.getSubcommand();
    let db = getData();

    // 1. LỆNH HELP
    if (subcommand === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 Hướng dẫn Bot Giveaway')
            .setColor('#5865F2')
            .addFields(
                { name: '`/giveaway start`', value: 'Tạo giveaway. Thời gian dùng `1m`, `1h`, `1d` hoặc `manual` để Admin tự chốt.' },
                { name: '`/giveaway quick`', value: 'Quay số ngay lập tức (Lọc Online/Role/ID).' },
                { name: '`/giveaway end [ID]`', value: 'Chốt giải cho giveaway đang chạy.' },
                { name: '`/giveaway cancel [ID]`', value: 'Hủy giveaway (không trao giải).' },
                { name: '`/giveaway list`', value: 'Xem các ID đang chạy.' },
                { name: '`/giveaway history`', value: 'Xem lịch sử người thắng.' }
            );
        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    // 2. LỆNH LIST
    if (subcommand === 'list') {
        if (db.active.length === 0) return interaction.reply({ content: 'Không có giveaway nào đang chạy.', ephemeral: true });
        const listStr = db.active.map(g => `\`#${g.id}\` - **${g.prize}** (Tham gia: ${g.participants.length})`).join('\n');
        return interaction.reply({ content: `**Danh sách giveaway:**\n${listStr}`, ephemeral: true });
    }

    // 3. LỆNH HISTORY
    if (subcommand === 'history') {
        if (db.past_winners.length === 0) return interaction.reply({ content: 'Chưa có lịch sử trúng giải.', ephemeral: true });
        const historyEmbed = new EmbedBuilder()
            .setTitle('🏆 Lịch Sử Trúng Giải')
            .setColor('#FFD700')
            .setDescription(db.past_winners.slice(-15).map((h, i) => `**${h.date}**: <@${h.userId}> thắng **${h.prize}** (ID #${h.id})`).join('\n'));
        return interaction.reply({ embeds: [historyEmbed], ephemeral: true });
    }

    // 4. LỆNH START (REACT)
    if (subcommand === 'start') {
        const title = interaction.options.getString('title');
        const prize = interaction.options.getString('prize');
        const durationInput = interaction.options.getString('duration');
        const winnersCount = interaction.options.getInteger('winners');

        const currentID = db.counter++;
        const isManual = durationInput.toLowerCase() === 'manual';
        const durationMs = isManual ? 0 : ms(durationInput);

        if (!isManual && !durationMs) return interaction.reply({ content: 'Thời gian không hợp lệ!', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${title} 🎉`)
            .setColor('#5865F2')
            .addFields(
                { name: '🎁 Phần thưởng', value: `**${prize}**`, inline: true },
                { name: '👥 Số người thắng', value: `${winnersCount}`, inline: true },
                { name: '🆔 ID Quản lý', value: `\`#${currentID}\``, inline: true },
                { name: '⌛ Kết thúc', value: isManual ? 'Chờ Admin chốt thủ công' : `<t:${Math.floor((Date.now() + durationMs) / 1000)}:R>` }
            )
            .setFooter({ text: 'Nhấn nút 🎉 bên dưới để tham gia!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gw_btn_${currentID}`).setLabel('Tham gia!').setEmoji('🎉').setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        db.active.push({
            id: currentID,
            messageId: msg.id,
            channelId: msg.channel.id,
            guildId: msg.guild.id,
            title, prize, winnersCount,
            participants: [],
            isManual,
            endTime: isManual ? null : Date.now() + durationMs
        });
        saveData(db);

        createBtnCollector(currentID, msg);

        if (!isManual) {
            setTimeout(() => finishGiveaway(currentID, true), durationMs);
        }
    }

    // 5. LỆNH QUICK (QUAY NGAY)
    if (subcommand === 'quick') {
        await interaction.reply({ content: '🎲 Đang quét thành viên và quay số...' });
        const title = interaction.options.getString('title');
        const type = interaction.options.getString('type');
        const prize = interaction.options.getString('prize');

        const members = await interaction.guild.members.fetch({ withPresences: true });
        let pool = [];

        if (type === 'active') {
            pool = members.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline');
        } else if (type === 'role') {
            const role = interaction.options.getRole('role');
            pool = members.filter(m => !m.user.bot && m.roles.cache.has(role.id));
        } else if (type === 'custom') {
            const ids = interaction.options.getString('ids').split(',').map(id => id.trim());
            pool = members.filter(m => ids.includes(m.id));
        }

        const candidates = Array.from(pool.values());
        if (candidates.length === 0) return interaction.editReply('❌ Không tìm thấy ai hợp lệ để quay!');

        const winner = candidates[Math.floor(Math.random() * candidates.length)];
        const dateStr = new Date().toLocaleString('vi-VN');

        // Lưu vào lịch sử
        db.past_winners.push({ id: 'QUICK', userId: winner.id, prize, date: dateStr });
        saveData(db);

        const winEmbed = new EmbedBuilder()
            .setTitle(`🎊 ${title} 🎊`)
            .setColor('#00FF00')
            .addFields(
                { name: '🎁 Phần thưởng', value: prize },
                { name: '👤 Người may mắn', value: `${winner}` },
                { name: '📊 Chế độ', value: `Quay nhanh (${type})` }
            )
            .setThumbnail(winner.user.displayAvatarURL());

        setTimeout(() => {
            interaction.editReply({ content: `Chúc mừng ${winner}! 🎉`, embeds: [winEmbed] });
        }, 3000);
    }

    // 6. LỆNH END (CHỐT)
    if (subcommand === 'end') {
        const id = interaction.options.getInteger('id');
        const success = await finishGiveaway(id, true);
        interaction.reply({ content: success ? `✅ Đã chốt giveaway #${id}` : `❌ Không thấy giveaway #${id}`, ephemeral: true });
    }

    // 7. LỆNH CANCEL (HỦY)
    if (subcommand === 'cancel') {
        const id = interaction.options.getInteger('id');
        if (id) {
            const success = await finishGiveaway(id, false);
            interaction.reply({ content: success ? `🗑 Đã hủy giveaway #${id}` : `❌ Không thấy giveaway #${id}`, ephemeral: true });
        } else {
            for (const g of db.active) await finishGiveaway(g.id, false);
            interaction.reply({ content: '🗑 Đã hủy TOÀN BỘ giveaway.', ephemeral: true });
        }
    }
});

// --- HÀM XỬ LÝ CHÍNH ---

function createBtnCollector(id, message) {
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
    activeCollectors.set(id, collector);

    collector.on('collect', async i => {
        let db = getData();
        let gw = db.active.find(g => g.id === id);
        if (!gw) return;

        if (gw.participants.includes(i.user.id)) {
            return i.reply({ content: 'Bạn đã tham gia rồi!', ephemeral: true });
        }

        gw.participants.push(i.user.id);
        saveData(db);
        i.reply({ content: `✅ Đã đăng ký tham gia Giveaway #${id}!`, ephemeral: true });
    });
}

async function finishGiveaway(id, shouldDraw) {
    let db = getData();
    const index = db.active.findIndex(g => g.id === id);
    if (index === -1) return false;

    const gw = db.active[index];
    const channel = await client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) return false;
    const message = await channel.messages.fetch(gw.messageId).catch(() => null);

    if (shouldDraw) {
        const winners = gw.participants.sort(() => 0.5 - Math.random()).slice(0, gw.winnersCount);
        const dateStr = new Date().toLocaleString('vi-VN');

        winners.forEach(wId => {
            db.past_winners.push({ id, userId: wId, prize: gw.prize, date: dateStr });
        });

        const winEmbed = new EmbedBuilder()
            .setTitle(`🎁 KẾT THÚC: ${gw.title}`)
            .setColor('#2F3136')
            .setDescription(`**Phần thưởng:** ${gw.prize}\n**Người thắng:** ${winners.length ? winners.map(w => `<@${w}>`).join(', ') : 'Không có ai tham gia'}`)
            .setFooter({ text: `Ngày chốt: ${dateStr} | ID #${id}` });

        if (message) await message.edit({ embeds: [winEmbed], components: [] });
        if (winners.length && channel) channel.send(`Chúc mừng ${winners.map(w => `<@${w}>`).join(', ')} đã trúng giải **${gw.prize}**! 🎉`);
    } else {
        if (message) {
            const cancelEmbed = new EmbedBuilder().setTitle(`🚫 ĐÃ HỦY: ${gw.title}`).setDescription('Giveaway này đã bị hủy bỏ bởi Quản trị viên.').setColor('#FF0000');
            await message.edit({ embeds: [cancelEmbed], components: [] });
        }
    }

    if (activeCollectors.has(id)) {
        activeCollectors.get(id).stop();
        activeCollectors.delete(id);
    }

    db.active.splice(index, 1);
    saveData(db);
    return true;
}

// Khôi phục collector khi bot bật lại
async function reanimateCollectors() {
    let db = getData();
    for (const gw of db.active) {
        try {
            const channel = await client.channels.fetch(gw.channelId);
            const message = await channel.messages.fetch(gw.messageId);
            createBtnCollector(gw.id, message);
            
            // Nếu là tự động và còn thời gian, đặt lại timeout
            if (!gw.isManual) {
                const remaining = gw.endTime - Date.now();
                if (remaining > 0) {
                    setTimeout(() => finishGiveaway(gw.id, true), remaining);
                } else {
                    finishGiveaway(gw.id, true);
                }
            }
        } catch (e) {
            console.log(`Không thể khôi phục giveaway #${gw.id}`);
        }
    }
}

client.login(TOKEN);