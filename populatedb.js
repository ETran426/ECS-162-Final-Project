// populatedb.js
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const canvas = require('canvas');
//require('./showdb');

// Placeholder for the database file name
const dbFileName = 'your_database_file.db';

async function initializeDB() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    // Clear existing tables
    await db.exec(`DROP TABLE IF EXISTS users;`);
    await db.exec(`DROP TABLE IF EXISTS posts;`);
    await db.exec(`DROP TABLE IF EXISTS comments;`);
    await db.exec(`DROP TABLE IF EXISTS tags;`);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            FOREIGN KEY (postId) REFERENCES posts(id),
            FOREIGN KEY (username) REFERENCES users(username)
        );
        
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT NOT NULL UNIQUE,
            count INTEGER NOT NULL
        );
    `);

    // Sample data - Replace these arrays with your own data
    const users = [
        { username: 'user1', hashedGoogleId: 'hashedGoogleId1', avatar_url: '', memberSince: '2024-01-01 12:00:00' },
        { username: 'user2', hashedGoogleId: 'hashedGoogleId2', avatar_url: '', memberSince: '2024-01-02 12:00:00' }
    ];

    const posts = [
        { title: 'First Post', content: 'This is the first post #first', username: 'user1', timestamp: '2024-01-01 12:30:00', likes: 0 },
        { title: 'Second Post', content: 'This is the second post #second', username: 'user2', timestamp: '2024-01-02 12:30:00', likes: 0 }
    ];

    const comments = [
        { username: 'user2', content: 'Great first post!', timestamp: '2024-01-01 13:00:00' },
        { username: 'user1', content: 'Nice second post!', timestamp: '2024-01-02 13:00:00' }
    ];

    const tags = [
        { tag: '#first', count: 1 },
        { tag: '#second', count: 1 }
    ];

    // Insert sample data into the database
    await Promise.all(users.map(user => {
        return db.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
        );
    }));

    await Promise.all(posts.map(post => {
        return db.run(
            'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
            [post.title, post.content, post.username, post.timestamp, post.likes]
        );
    }));

    // Get post IDs to associate comments with the correct posts
    const postIds = await db.all('SELECT id, title FROM posts');
    const postMap = {};
    postIds.forEach(post => {
        postMap[post.title] = post.id;
    });

    await Promise.all(comments.map((comment, index) => {
        return db.run(
            'INSERT INTO comments (postId, username, content, timestamp) VALUES (?, ?, ?, ?)',
            [postMap[posts[index].title], comment.username, comment.content, comment.timestamp]
        );
    }));

    await Promise.all(tags.map(tag => {
        return db.run(
            'INSERT INTO tags (tag, count) VALUES (?, ?)',
            [tag.tag, tag.count]
        );
    }));

    await updateUsersWithEmptyAvatar();
    console.log('Database populated with initial data.');
    await db.close();
}

// Export the initializeDB function
module.exports = initializeDB;

initializeDB().catch(err => {
    console.error('Error initializing database:', err);
});

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {

    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer
    const canvasInstance = canvas.createCanvas(width, height);
    const context = canvasInstance.getContext('2d');

    // Choose a color scheme based on the letter
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#FF8C33', '#00FFFF', '#FF1493', '#7FFF00', '#8A2BE2', '#FFD700', '#32CD32', '#4682B4', '#20B2AA', '#800000', '#556B2F'];

    // Choose a random color from the pool
    const randomIndex = Math.floor(Math.random() * colors.length);
    const backgroundColor = colors[randomIndex];

    const textColor = '#FFFFFF';

    // Draw the background color
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);

    // Draw the letter in the center
    context.font = `bold ${width / 2}px 'Times New Roman'`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = textColor;
    context.fillText(letter, width / 2, height / 2);

    return canvasInstance.toBuffer('image/png');
}  

async function updateUsersWithEmptyAvatar() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    // Select users with empty avatar_url
    const users = await db.all('SELECT * FROM users WHERE avatar_url IS NULL OR avatar_url = ""');

    for (const user of users) {
        if (user && user.username) {
            const letter = user.username.charAt(0).toUpperCase();
            const avatarBuffer = generateAvatar(letter);
            const avatarUrl = `data:image/png;base64,${avatarBuffer.toString('base64')}`;

            // Update the user's avatar_url in the database
            await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
        }
    }

    await db.close();
}

updateUsersWithEmptyAvatar().catch(err => {
    console.error('Error updating user avatars:', err);
});