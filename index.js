const express = require('express');
const { createServer } = require('http');
const { join } = require('path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const server = createServer(app);
const io = new Server(server);

async function main() {
    const db = await open({
        filename: 'chat.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_offset TEXT UNIQUE,
            content TEXT,
            sender TEXT
        );
    `);

    app.get('/', (req, res) => {
        res.sendFile(join(__dirname, 'index.html'));
    });

    const users = {};

    // Fungsi untuk menampilkan notifikasi
 function showNotification(message) {
    if (!("Notification" in window)) {
        alert("This browser does not support desktop notification");
    } else if (Notification.permission === "granted") {
        new Notification(message);
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function (permission) {
            if (permission === "granted") {
                new Notification(message);
            }
        });
    }
}


   // Fungsi untuk memperbarui daftar pengguna online
 function updateUserList(user, action) {
    if (action === 'add') {
        onlineUsers.push(user);
        showNotification(`${user} joined the chat`); // Tampilkan notifikasi saat pengguna bergabung
    } else if (action === 'remove') {
        onlineUsers = onlineUsers.filter(u => u !== user);
        showNotification(`${user} left the chat`); // Tampilkan notifikasi saat pengguna keluar
    }
    renderUserList();
}


    io.on('connection', async (socket) => {
        console.log('a user connected');

        socket.on('username', (username) => {
            users[socket.id] = username;
            console.log(`${username} joined the chat`);
            io.emit('user joined', username);
            updateOnlineUsers();
        });


        // Tangani event user bergabung
    socket.on('user joined', (user) => {
     addMessage(`${user} joined the chat`, '', 'message-info');
     updateUserList(user, 'add');
     showNotification(`${user} joined the chat`); // Tampilkan notifikasi saat pengguna bergabung
     }); 

     // Tangani event user keluar
      socket.on('user left', (user) => {
     addMessage(`${user} left the chat`, '', 'message-info');
     updateUserList(user, 'remove');
     showNotification(`${user} left the chat`); // Tampilkan notifikasi saat pengguna keluar
     });
        

        // Tangani pesan notifikasi dari server
         socket.on('notification', (message) => {
         // Tampilkan pesan notifikasi kepada pengguna (misalnya, menggunakan alert atau notifikasi browser)
         alert(message); // Ganti dengan tampilan notifikasi yang lebih kustom jika diperlukan
         });


        socket.on('chat message', async (msg) => {
            if (!users[socket.id]) {
                socket.emit('request username');
                return;
            }

            const clientOffset = `${socket.id}-${Date.now()}`;
            const sender = users[socket.id];
            let result;
            try {
                result = await db.run('INSERT INTO messages (client_offset, content, sender) VALUES (?, ?, ?)', clientOffset, msg.message, sender);
            } catch (e) {
                console.error('Failed to insert message:', e);
                return;
            }
            io.emit('chat message', { message: msg.message, sender: sender, id: result.lastID });
        });

        if (!socket.recovered) {
            try {
                await db.each('SELECT id, content, sender FROM messages WHERE id > ?', 
                    [socket.handshake.auth.serverOffset || 0], 
                    (_err, row) => {
                        socket.emit('chat message', { message: row.content, sender: row.sender, id: row.id });
                    }
                );
            } catch (e) {
                console.error('Failed to recover messages:', e);
            }
        }

        socket.on('disconnect', () => {
            const username = users[socket.id];
            if (username) {
                delete users[socket.id];
                io.emit('user left', username);
                updateOnlineUsers();
            }
        });
    });
}

main();

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
});
