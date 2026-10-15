const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/images', express.static('images'));

// Подключение к облачной базе данных Neon через переменную окружения
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Корневой маршрут (убирает ошибку Cannot GET /)
app.get('/', (req, res) => {
    res.json({
        status: "success",
        message: "Road Signs Astana API is running!",
        endpoints: {
            login: "POST /api/login",
            signs: "GET /api/signs",
            signTypes: "GET /api/sign-types",
            addSign: "POST /api/signs",
            updateSign: "PUT /api/signs/:id",
            deleteSign: "DELETE /api/signs/:id"
        }
    });
});

// Проверка ролей (RBAC Middleware)
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        const userRole = req.headers['x-user-role'] || 'viewer';
        if (allowedRoles.includes(userRole)) {
            next();
        } else {
            res.status(403).json({ error: 'Недостаточно прав доступа' });
        }
    };
};

// 1. Авторизация (Login)
app.post('/api/login', async (req, res) => {
    const { role, password } = req.body;
    
    // Простейшая проверка пароля (для демо-версии: пароль 123456)
    if (password === '123456') {
        res.json({ success: true, role: role, message: 'Успешный вход!' });
    } else {
        res.status(401).json({ success: false, error: 'Неверный пароль' });
    }
});

// 2. Получить список всех знаков
app.get('/api/signs', async (req, res) => {
    try {
        const query = `
            SELECT rs.id, rs.sign_type_id, st.code AS sign_code, st.name AS sign_name, st.image_url,
                   ST_X(rs.geom) AS longitude, ST_Y(rs.geom) AS latitude,
                   rs.heading, rs.description
            FROM road_signs rs
            JOIN sign_types st ON rs.sign_type_id = st.id;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Ошибка сервера');
    }
});

// 3. Справочник типов знаков
app.get('/api/sign-types', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, code, name, image_url, category_name FROM sign_types ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Ошибка сервера');
    }
});

// 4. Добавить знак (editor, admin)
app.post('/api/signs', checkRole(['editor', 'admin']), async (req, res) => {
    try {
        const { sign_type_id, latitude, longitude, heading, description } = req.body;
        const query = `
            INSERT INTO road_signs (sign_type_id, geom, heading, description, created_by)
            VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, 1)
            RETURNING id;
        `;
        const values = [sign_type_id, longitude, latitude, heading || 0, description || ''];
        const result = await pool.query(query, values);
        res.status(201).json({ message: 'Знак добавлен', id: result.rows[0].id });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Ошибка сервера');
    }
});

// 5. Обновить знак (editor, admin)
app.put('/api/signs/:id', checkRole(['editor', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { sign_type_id, latitude, longitude, heading, description } = req.body;
        const query = `
            UPDATE road_signs 
            SET sign_type_id = $1, geom = ST_SetSRID(ST_MakePoint($2, $3), 4326), heading = $4, description = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6;
        `;
        const values = [sign_type_id, longitude, latitude, heading || 0, description || '', id];
        await pool.query(query, values);
        res.json({ message: 'Знак обновлен' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Ошибка сервера');
    }
});

// 6. Удалить знак (ТОЛЬКО admin)
app.delete('/api/signs/:id', checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM road_signs WHERE id = $1', [id]);
        res.json({ message: 'Знак удален' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Ошибка сервера');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});