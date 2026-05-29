const express  = require('express');
const cors  = require('cors');
const path  = require('path');
const fs  = require('fs');
const initSqlJs  = require('sql.js');

// 'app' is our server object, we call methods on it to define routes
const app = express();

// Middleware - runs on every request before it reaches our route handlers
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// we store the database on disk as 'tasks.db' so data persists between restarts.
const DB_PATH = path.join(__dirname, 'tasks.db');

// 'db' holds our database connection
let db;

// initSqlJs()
initSqlJs().then((SQL) => {
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT NOT NULL,
        description         TEXT NOT NULL
        )
        `);

        saveDatabase(); // persist the newly created schema to disk immediately

        console.log('Database ready - table "tasks" exists.');

        //
        const PORT = 3000;
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

}).catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
});

// helper function
function saveDatabase() {
    const data  = db.export(); 
    const buffer = Buffer.from(data); // convert to Node buffer
    fs.writeFileSync(DB_PATH, buffer);
}

// Route handlers
// GET  returns all tasks stored in the database as JSON
app.get('/tasks', (req, res) => {
    try {
        const results = db.exec('SELECT * FROM tasks');

        if (results.length === 0) {
            return res.status(200).json([]);
        }

        const { columns, values } = results[0];

        const tasks = values.map((row) => {
            const task ={};
            columns.forEach((col, index) => {
                task[col] = row[index];
            });
            return task;
        });

        res.status(200).json(tasks);
    } catch (err) {
        console.error('GET /tasks error:', err);
        res.status(500).json({ error: 'Failed to retrieve tasks.' }); // 500 = serever error
    }
});

// POST  adds a brand new task to the database
app.post('/tasks', (req, res) => {
    try {
        const { title, description } = req.body; //destructuring the parsed JSON body
        console.log('POST hit - body:', req.body);

        if (!title || !description || title.trim() === '' || description.trim() === '') {
            return res.status(400).json({ error: 'Both title and description are required.'});
           
        }
        console.log('Validation passed');
        db.run('INSERT INTO tasks (title, description) VALUES (?, ?)', [title.trim(), description.trim()]);
        console.log('Insert done');

        const idResult = db.exec('SELECT last_insert_rowid()');
        console.log('idResult:', idResult)
        const newId = idResult[0].values[0][0];

        saveDatabase();

        // Respond with newly created task and status 201
        res.status(201).json({
            id:         newId,
            title:      title.trim(),
            description: description.trim()
        });

    } catch (err) {
        console.error('POST /tasks error:', err);
        res.status(500).json({ error: 'Failed to add task.'});
    }
}); 

// DELETE /tasks/:id - this will help delete a single tasks identified by its ID.

app.delete('/tasks/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        // parseint returns NaN if the param isn't a valid
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid task ID.'}); // parameterised for safety
        
        }

        db.run('DELETE FROM tasks WHERE id = ?', [id]);

        saveDatabase();

        res.status(200).json({ message: `Task ${id} deleted successfully`});

    } catch (err) {
        console.error('DELETE /tasks/:id error:', err);
        res.status(500).json({ error: 'Failed to delete task.'});
    }
});