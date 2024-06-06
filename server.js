const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
require('dotenv').config();
//require('./showdb');

const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');


// Placeholder for the database file name
const dbFileName = 'your_database_file.db';

// Access the API key
const emojiApiKey = process.env.EMOJI_API_KEY;

// sources
// https://www.w3schools.com/jsref/jsref_find.asp
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/padStart
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// added userName used to help compare
app.use((req, res, next) => {
    res.locals.appName = 'AggieBlog';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Moo';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    res.locals.userName = req.session.userName || '';
    
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => {
    try {
        const sortOption = req.query.sort || '';
        const tag = req.query.tag || '';

        // console.log(`Sort option: ${sortOption}`);
        // console.log(`Tag: ${tag}`);

        const posts = tag ? await getPostsByTag(tag) : await getPosts(sortOption);

        const user = await getCurrentUser(req) || {};

        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        const popularTags = await db.all('SELECT tag, count FROM tags ORDER BY count DESC LIMIT 5');
        await db.close();

        res.render('home', { posts, user, popularTags, emojiApiKey });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.redirect('/error');
    }
});

// Register GET route is used for error response from registration
//
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//

app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});



// Additional routes that you must implement
//
app.post('/posts', async (req, res) => {
    // TODO: Add a new post and redirect to home
    // Must be logged in
    if (!(req.session.userName)) {
        return res.redirect('/login');
    }
    const { title, content } = req.body;
    const user = await findUserById(req.session.userId);
    if (user && title && content) {
        await addPost(title, content, user);
        //console.log('User avatar_url:', user.avatar_url); // Log the avatar_url
        res.redirect('/');
    } else {
        res.redirect('/error');
    }
});

app.post('/like/:id', isAuthenticated, async (req, res) => {
    try {
        await updatePostLikes(req, res);
    } catch (error) {
        console.error('Error updating post likes:', error);
        res.redirect('/error');
    }
});

app.get('/profile', isAuthenticated, async (req, res) => {
    try {
        await renderProfile(req, res);
    } catch (error) {
        console.error('Error rendering profile:', error);
        res.redirect('/error');
    }
});


app.get('/avatar/:username', async (req, res) => {
    try {
        await handleAvatar(req, res);
    } catch (error) {
        console.error('Error handling avatar:', error);
        res.redirect('/error');
    }
});

app.post('/registerUsername', async (req, res) => {
    try {
        await registerUser(req, res);
    } catch (error) {
        console.error('Error registering user:', error);
        res.redirect('/error');
    }
});

app.get('/logout', (req, res) => {
    try {
        logoutUser(req, res);
    } catch (error) {
        console.error('Error logging out user:', error);
        res.redirect('/error');
    }
});

app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

app.post('/delete/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id);
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
        if (post && post.username === req.session.userName) {
            const hashtags = extractHashtags(post.content);

            // Update the tags database
            for (const tag of hashtags) {
                const existingTag = await db.get('SELECT * FROM tags WHERE tag = ?', [tag]);
                if (existingTag) {
                    if (existingTag.count > 1) {
                        await db.run('UPDATE tags SET count = count - 1 WHERE tag = ?', [tag]);
                    } else {
                        await db.run('DELETE FROM tags WHERE tag = ?', [tag]);
                    }
                }
            }

            // Delete the post
            await db.run('DELETE FROM posts WHERE id = ?', [postId]);
            res.redirect('/');
        } else {
            res.redirect('/error'); // Post not found or user is not the owner
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        res.redirect('/error');
    } finally {
        await db.close();
    }
});

// Google 
app.get('/auth/google', (req, res) => {
    const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    });
    res.redirect(url);
});

// Handle OAuth 2.0 server response
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({
        auth: client,
        version: 'v2',
    });

    const userinfo = await oauth2.userinfo.get();
     
    const user = await findUserById(userinfo.data.id)
    if (user) {
        req.session.userId = userinfo.data.id;
        await loginUser(req, res);
    } else {
        req.session.userId = userinfo.data.id;
        res.redirect('/registerUsername');
    }

});


// Comments route
app.post('/comments', isAuthenticated, async (req, res) => {
    const { postId, content } = req.body;
    const user = await findUserById(req.session.userId);

    if (user && postId && content) {
        await addComment(postId, content, user);
        res.redirect('/');
    } else {
        res.redirect('/error');
    }
});



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, async () => {
    try {
        await require('./populatedb');

        console.log(`Server is running on http://localhost:${PORT}`);
    } catch (error) {
        console.error('Error occurred during server startup:', error);
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Function to find a user by username
async function findUserByUsername(username) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    return await db.get('SELECT * FROM users WHERE username = ?', [username]);
}

// Function to find a user by user ID
async function findUserById(userId) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    return await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [userId]);
}


// Function to add a new user
async function addUser(username, hashedGoogleId) {
    // TODO: Create a new user object and add to users array
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hour = String(currentDate.getHours()).padStart(2, '0');
    const minute = String(currentDate.getMinutes()).padStart(2, '0');

    const memberSince = `${year}-${month}-${day} ${hour}:${minute}`;

    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    const result = await db.run(
        'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
        [username, hashedGoogleId, '', memberSince]
    );

    return {
        username,
        hashedGoogleId,
        avatar_url: '',
        memberSince,
    };
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId && req.session.userName) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
async function registerUser(req, res) {
    // TODO: Register a new user and redirect appropriately
    const { username } = req.body;

    if (!username || await findUserByUsername(username)) {
        return res.redirect('/registerUsername?error=Username already exists or is invalid');
    }

    const newUser = await addUser(username, req.session.userId);
    req.session.userName = newUser.username;
    req.session.userId = newUser.hashedGoogleId;
    req.session.loggedIn = true;

    res.redirect('/');
}

// Function to login a user
async function loginUser(req, res) {
    //const { username } = req.body;

    //require('./showdb');
    const user = await findUserById(req.session.userId);

    req.session.userName = user.username;
    req.session.userId = user.hashedGoogleId;
    req.session.loggedIn = true;

    // console.log(`User details from req:
    // Username: ${req.session.userName}
    // HashedGoogleId: ${ req.session.userId}`);
    res.redirect('/');
}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy();
    res.redirect('/googleLogout');
}

// Function to render the profile page
async function renderProfile(req, res) {
    // TODO: Fetch user posts and render the profile page
    try {
        // Fetch the current user
        const user = await getCurrentUser(req);

        if (user) {
            const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

            // Fetch user posts and include avatar_url using a join query
            const userPosts = await db.all(`
                SELECT p.*, u.avatar_url
                FROM posts p
                JOIN users u ON p.username = u.username
                WHERE p.username = ?
                ORDER BY p.timestamp DESC
            `, [user.username]);

            // Include the posts within the user object
            user.posts = userPosts;

            // Render the profile view with the user object containing posts
            res.render('profile', { user });
        } else {
            console.error('Error getting user info', error);
            res.redirect('/error');
        }
    } catch (error) {
        console.error('Error rendering profile:', error);
        res.redirect('/error');
    }
}

// Function to update post likes
async function updatePostLikes(req, res) {
    // TODO: Increment post likes if conditions are met
    const postId = parseInt(req.params.id);
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
    if (post) {
        await db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [postId]);
        res.redirect('/');
    } else {
        res.redirect('/error');
    }
}

// Function to handle avatar generation and serving
async function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
    const username = req.params.username;
    const user = await findUserByUsername(username);

    if (user.avatar_url === '') {
        const avatarBuffer = generateAvatar(username.charAt(0).toUpperCase());

        user.avatar_url = `data:image/png;base64,${avatarBuffer.toString('base64')}`;

        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        await db.run('UPDATE users SET avatar_url = ? WHERE username = ?', [user.avatar_url, username]);

        res.set('Content-Type', 'image/png');
        res.send(avatarBuffer);
    } 
}

// Function to get the current user from session
async function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    return await findUserById(req.session.userId);
}

// Function to get comments for post
async function addComment(postId, content, user) {
    const currentDate = new Date();
    const timestamp = currentDate.toISOString().slice(0, 19).replace('T', ' ');

    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    await db.run('INSERT INTO comments (postId, username, content, timestamp) VALUES (?, ?, ?, ?)', [postId, user.username, content, timestamp]);
    await db.close();
}

// Function to get all posts, sorted by latest first
async function getPosts(sortOption) {

    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    let sortQuery = 'ORDER BY p.timestamp DESC';

    if (sortOption === 'likes') {
        sortQuery = 'ORDER BY p.likes DESC';
    }

    const posts = await db.all(`
        SELECT p.*, u.avatar_url
        FROM posts p
        JOIN users u ON p.username = u.username
        ${sortQuery}
    `);

    for (const post of posts) {
        post.comments = await db.all('SELECT c.*, u.avatar_url FROM comments c JOIN users u ON c.username = u.username WHERE c.postId = ? ORDER BY c.timestamp ASC', [post.id]);
    }

    await db.close();
    return posts;
}

// Function to add a new post
async function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hour = String(currentDate.getHours()).padStart(2, '0');
    const minute = String(currentDate.getMinutes()).padStart(2, '0');

    const timestamp = `${year}-${month}-${day} ${hour}:${minute}`;

    // Init Post and push into posts array after config time formatt
    // added avatar url to make post handlebar display avatar of poster
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    const result = await db.run(
        'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
        [title, content, user.username, timestamp, 0]
    );

    const hashtags = extractHashtags(content);
    for (const tag of hashtags) {
        const existingTag = await db.get('SELECT * FROM tags WHERE tag = ?', [tag]);
        if (existingTag) {
            await db.run('UPDATE tags SET count = count + 1 WHERE tag = ?', [tag]);
        } else {
            await db.run('INSERT INTO tags (tag, count) VALUES (?, ?)', [tag, 1]);
        }
    }
    
    return {
        //id: result.lastID,
        title,
        content,
        username: user.username,
        timestamp,
        likes: 0,
        avatar_url: user.avatar_url,
    };
}

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

function extractHashtags(content) {
    const hashtags = content.match(/#\w+/g);
    return hashtags ? hashtags.map(tag => tag.toLowerCase()) : [];
}

async function getPostsByTag(tag) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    const posts = await db.all(`
        SELECT p.*, u.avatar_url
        FROM posts p
        JOIN users u ON p.username = u.username
        WHERE p.content LIKE ?
        ORDER BY p.timestamp DESC
    `, [`%${tag}%`]);

    for (const post of posts) {
        post.comments = await db.all('SELECT c.*, u.avatar_url FROM comments c JOIN users u ON c.username = u.username WHERE c.postId = ? ORDER BY c.timestamp ASC', [post.id]);
    }

    await db.close();
    return posts;
}