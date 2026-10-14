CREATE DATABASE IF NOT EXISTS event_ticketing;
USE event_ticketing;

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'organiser', 'administrator', 'staff')
        NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. API TOKENS
CREATE TABLE IF NOT EXISTS api_tokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. VENUES
CREATE TABLE IF NOT EXISTS venues (
    venue_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    capacity INT UNSIGNED NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. EVENTS
CREATE TABLE IF NOT EXISTS events (
    event_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_id INT UNSIGNED,
    event_name VARCHAR(150) NOT NULL,
    description TEXT,
    event_date DATETIME NOT NULL,
    ticket_price DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
    available_tickets INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id)
        REFERENCES venues(venue_id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
    booking_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    event_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    total_price DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
    status ENUM('confirmed', 'cancelled', 'pending')
        NOT NULL DEFAULT 'confirmed',
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)
        REFERENCES users(user_id),
    FOREIGN KEY (event_id)
        REFERENCES events(event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- INSERT DATA: USERS

INSERT INTO users
(user_id, name, email, password, role, created_at)
VALUES
(1, 'Ali Admin', 'admin@eventticketing.com',
 '$2y$10$uVPYOfXC084rHZVjbX7Xju0dIOYVFB3priagRaNxctIdDQKU3rZBW',
 'administrator', '2026-10-10 23:35:24'),

(2, 'Siti Organiser', 'siti@eventticketing.com',
 '$2y$10$/hyGFQy7zrjBftFtUHTRVu4hJuL7KrK8AY0dTLCFRP1vKCiiI.G8q',
 'organiser', '2026-10-10 23:35:24'),

(3, 'Ahmad Staff', 'ahmad@eventticketing.com',
 '$2y$10$l.d79EIYJTlRzH37UTjQM.Oxhe9YS23rO5LPNACDdkuP7lzwBhMB.',
 'staff', '2026-10-10 23:35:24'),

(4, 'Fatimah Customer', 'fatimah@gmail.com',
 '$2y$10$QerjHhgGiNdPHiRSNocNcuCH2LKmQexjkrzuKJFeBDZIgAzkl330O',
 'customer', '2026-10-10 23:35:24'),

(5, 'John Doe', 'John@gmail.com',
 '$2y$10$cw4ACtMuq9HNlYJBATvaG.sU3BAws48FZJ1N6.J3XR0JVibU8x6bi',
 'customer', '2026-10-10 23:35:24');


-- INSERT DATA: VENUES

INSERT INTO venues
(venue_id, venue_name, address, capacity, description, created_at)
VALUES
(1, 'UPTM Merdeka Hall',
 'Jalan Cheras, Kuala Lumpur', 500,
 'A hall for concerts, seminars and university events',
 '2026-10-10 23:40:49'),

(2, 'Bukit Jalil Indoor Stadium',
 'Bukit Jalil, Kuala Lumpur', 10000,
 'An indoor stadium for large-scale events and competitions',
 '2026-10-10 23:40:49'),

(3, 'Plaza Shah Alam Convention Centre',
 'Section 9, Shah Alam, Selangor', 1200,
 'A convention centre for exhibitions and conferences',
 '2026-10-10 23:40:49'),

(4, 'Perdana Auditorium',
 'Angkasapuri, Kuala Lumpur', 300,
 'An auditorium for talks, presentations and seminars',
 '2026-10-10 23:40:49'),

(5, 'Hotel Istana Ballroom',
 'Jalan Raja Chulan, Kuala Lumpur', 800,
 'A ballroom for dinners, conferences and formal events',
 '2026-10-10 23:40:49'),

(7, 'Test Venue API Updated',
 'Kuala Lumpur', 200,
 'Testing administrator venue update.',
 '2026-10-11 01:30:55');


-- INSERT DATA: EVENTS

INSERT INTO events
(event_id, venue_id, event_name, description, event_date,
 ticket_price, available_tickets, created_at)
VALUES
(1, 1, 'Test Event API',
 'Event created for API testing',
 '2026-11-20 20:00:00', 50.00, 100,
 '2026-10-10 23:42:13'),

(2, 2, 'IT Tech Symposium & Hackathon',
 'A programming competition and IT innovation exhibition.',
 '2026-11-25 09:00:00', 30.00, 5000,
 '2026-10-10 23:42:13'),

(3, 3, 'Mega Karnival Kerjaya & Internship',
 'Open interviews and an exhibition featuring technology companies.',
 '2026-12-05 10:00:00', 20.00, 1000,
 '2026-10-10 23:42:13'),

(4, 4, 'Forum Keselamatan Siber & AI',
 'A panel discussion on current cybersecurity threats.',
 '2026-12-10 14:30:00', 25.00, 250,
 '2026-10-10 23:42:13'),

(5, 5, 'Gala Dinner & Annual Award',
 'An appreciation dinner for students and staff.',
 '2026-12-20 19:30:00', 120.00, 700,
 '2026-10-10 23:42:13'),

(17, 1, 'Test Event API',
 'Testing event creation using Postman.',
 '2027-01-15 10:00:00', 35.00, 100,
 '2026-10-11 01:22:37'),

(19, 1, 'Test Event API',
 'Event created for API testing',
 '2026-11-20 20:00:00', 50.00, 100,
 '2026-10-11 02:31:03'),

(20, 1, 'Test Event Organiser',
 'Testing event creation',
 '2026-11-20 20:00:00', 50.00, 100,
 '2026-10-11 02:34:28'),

(21, 1, 'Test Event Organiser Updated',
 'Testing event update',
 '2026-11-20 20:00:00', 60.00, 100,
 '2026-10-11 02:36:21');



-- INSERT DATA: BOOKINGS

INSERT INTO bookings
(booking_id, user_id, event_id, quantity, total_price, status, booking_date)
VALUES
(11, 4, 1, 2, 100.00, 'confirmed',
 '2026-10-10 23:46:57'),

(12, 5, 2, 1, 30.00, 'confirmed',
 '2026-10-10 23:46:57'),

(13, 4, 3, 3, 0.00, 'confirmed',
 '2026-10-10 23:46:57'),

(14, 5, 4, 2, 50.00, 'cancelled',
 '2026-10-10 23:46:57'),

(15, 4, 5, 1, 120.00, 'confirmed',
 '2026-10-10 23:46:57'),

(17, 4, 21, 2, 120.00, 'pending',
 '2026-10-11 02:46:48');


-- INSERT DATA: API TOKENS

INSERT INTO api_tokens
(token_id, user_id, token_hash, expires_at, created_at)
VALUES
(1, 1, 'fad9a1cfef890868c27de7bf63c3af81a3ec379574a5929033fdd9c87bed70a1',
 '2026-10-11 11:12:09', '2026-10-11 01:12:09'),

(2, 1, '26badc1784823008a88401bf6cee444f47fd02d5f9f2ffb81baf89d0964452f5',
 '2026-10-11 11:15:37', '2026-10-11 01:15:37'),

(3, 2, '174cf83a335f20b19b42fe6e5becf05fee1f394635841088f2d4401e85205b2c',
 '2026-10-11 11:16:32', '2026-10-11 01:16:32'),

(4, 4, '62c3894adafc320d2c5219117026948b52ce0ed70d9e4f934a718a683c6b0f32',
 '2026-10-11 11:17:46', '2026-10-11 01:17:46'),

(5, 4, '5f573fdb1d6168f868c7c8895022cf718aa0dd0c0072655ab82e493d2561b01d',
 '2026-10-11 12:00:25', '2026-10-11 02:00:25'),

(6, 4, 'fe939394d97408d829ee97cc321b29a0f75eb937835b13bb21f9d72efd1c372f',
 '2026-10-11 12:05:22', '2026-10-11 02:05:22'),

(7, 4, '512185e6265b7b88375caf23db65972964a53ec4455d0b0f0926860bef083a9a',
 '2026-10-11 12:15:26', '2026-10-11 02:15:26'),

(8, 4, 'ded8fb01c92d2ce84974821e5c5475d94743d5c108d31060c574ea95d346ace8',
 '2026-10-11 12:17:12', '2026-10-11 02:17:12'),

(9, 1, '227c925b088cb2fcd6fd54598e540844723ca016699e15854ffa99fd6529ccc2',
 '2026-10-11 12:18:46', '2026-10-11 02:18:46'),

(10, 4, 'eb50768de3c05a900d70d870d8138b4bfb7cf775088cd10b3ad8366b288cf2b1',
 '2026-10-11 12:24:51', '2026-10-11 02:24:51'),

(11, 2, '05e09cd5d49b383b260109df7fb69b258a09a082afa47e17970ff937bc3aedc1',
 '2026-10-11 12:30:46', '2026-10-11 02:30:46'),

(12, 4, '0518321c30ff27115e9ee48a266d45ca29c8e8fa506942593b9dea45e9e6021f',
 '2026-10-11 12:32:10', '2026-10-11 02:32:10'),

(13, 2, '0b726f677ee4a205b34904728a9178276e7eb4514837c397f42be7700cfb6c70',
 '2026-10-11 12:34:07', '2026-10-11 02:34:07'),

(14, 4, 'ee552230e9e47159de10d29e3c04bd509c9cd5ca7cba6f0668ec9705be9a94f6',
 '2026-10-11 12:45:50', '2026-10-11 02:45:50'),

(15, 4, '2d0ae0c0a463be279319a4c70553f79d104274d485b7d4e9a696fd7edde1374d',
 '2026-10-11 13:00:28', '2026-10-11 03:00:28'),

(16, 4, 'cac7825061124714037604624f4471890b5fd926981d2c88f0cd4af3850aa724',
 '2026-10-11 13:17:56', '2026-10-11 03:17:56'),

(17, 1, 'd44fa07522500a7ef8a3680762e918a3f97ef4cfa7d1484e3ef742b002a34b40',
 '2026-10-11 14:04:56', '2026-10-11 04:04:56'),

(18, 4, '71ab02333825b1e993482914bd6e694527dcdebe115a26b539c74fa839d258af',
 '2026-10-11 14:05:29', '2026-10-11 04:05:29'),

(19, 5, '25e5b4eb93a1f780ba7bd2e88f7d7bfccd4f0047504df446e169c8487d7dfda9',
 '2026-10-11 14:15:41', '2026-10-11 04:15:41'),

(20, 5, '30ec71a62cd9064ff16a4551e46321c8447b4a09c709294e1925de7cedfd4b90',
 '2026-10-11 14:17:06', '2026-10-11 04:17:06'),

(21, 3, '0c1c43e0ba5367da6a160d0b1b18fed2bf7e30d8b88ffc94d74dfbca856f9f2c',
 '2026-10-11 14:22:45', '2026-10-11 04:22:45');


