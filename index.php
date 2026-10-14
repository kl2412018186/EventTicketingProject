
<?php

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";

// =====================================================
// HELPER FUNCTIONS
// =====================================================


function respond($data, $code = 200) {
    $logFile = __DIR__ . "/api.log";

    $logEntry = [
        "timestamp" => date("Y-m-d H:i:s"),
        "method" => $_SERVER["REQUEST_METHOD"] ?? "UNKNOWN",
        "endpoint" => parse_url(
            $_SERVER["REQUEST_URI"] ?? "/",
            PHP_URL_PATH
        ),
        "status" => $code
    ];

    $logLine = json_encode(
        $logEntry,
        JSON_UNESCAPED_SLASHES
    );

    if ($logLine !== false) {
        @file_put_contents(
            $logFile,
            $logLine . PHP_EOL,
            FILE_APPEND | LOCK_EX
        );
    }

    http_response_code($code);
    echo json_encode($data, JSON_PRETTY_PRINT);
    exit;
}


function inputData() {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);

    return is_array($data) ? $data : [];
}

function hasFields($data, $fields) {
    foreach ($fields as $field) {
        if (
            !array_key_exists($field, $data) ||
            $data[$field] === "" ||
            $data[$field] === null
        ) {
            respond([
                "success" => false,
                "message" => "Missing or empty required field: " . $field
            ], 400);
        }
    }
}

// =====================================================
// AUTHENTICATION
// =====================================================

function authenticateToken($pdo) {
    $authHeader = $_SERVER["HTTP_AUTHORIZATION"] ?? "";

    if (!$authHeader && function_exists("getallheaders")) {
        $headers = getallheaders();

        $authHeader = $headers["Authorization"]
            ?? $headers["authorization"]
            ?? "";
    }

    if (!preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        respond([
            "success" => false,
            "message" => "Access token required."
        ], 401);
    }

    $token = $matches[1];
    $tokenHash = hash("sha256", $token);

    $stmt = $pdo->prepare(
        "SELECT u.user_id, u.name, u.email, u.role
         FROM api_tokens t
         JOIN users u ON t.user_id = u.user_id
         WHERE t.token_hash = ?
         AND t.expires_at > NOW()"
    );

    $stmt->execute([$tokenHash]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        respond([
            "success" => false,
            "message" => "Invalid or expired token."
        ], 401);
    }

    return $user;
}

// =====================================================
// ROLE-BASED ACCESS CONTROL
// =====================================================

function requireRole($user, $allowedRoles) {
    if (!in_array($user["role"], $allowedRoles, true)) {
        respond([
            "success" => false,
            "message" => "Access denied. Insufficient permissions."
        ], 403);
    }
}

// =====================================================
// ROUTING
// =====================================================

$method = $_SERVER["REQUEST_METHOD"];
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

$marker = "/api/index.php";
$position = strpos($path, $marker);

if ($position !== false) {
    $resourcePath = substr(
        $path,
        $position + strlen($marker)
    );
} else {
    $resourcePath = "";
}

$segments = array_values(
    array_filter(
        explode("/", trim($resourcePath, "/")),
        "strlen"
    )
);

$resource = $segments[0] ?? "";
$id = isset($segments[1]) ? (int)$segments[1] : 0;

try {

    // =================================================
    // LOGIN
    // POST /login
    // =================================================

    if ($resource === "login" && $method === "POST") {
        $data = inputData();

        hasFields($data, ["email", "password"]);

        $stmt = $pdo->prepare(
            "SELECT user_id, name, email, password, role
             FROM users
             WHERE email = ?"
        );

        $stmt->execute([$data["email"]]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (
            !$user ||
            !password_verify(
                $data["password"],
                $user["password"]
            )
        ) {
            respond([
                "success" => false,
                "message" => "Invalid email or password."
            ], 401);
        }

        $token = bin2hex(random_bytes(32));
        $tokenHash = hash("sha256", $token);

        $expiresAt = date(
            "Y-m-d H:i:s",
            time() + (8 * 60 * 60)
        );

        $stmt = $pdo->prepare(
            "INSERT INTO api_tokens
             (user_id, token_hash, expires_at)
             VALUES (?, ?, ?)"
        );

        $stmt->execute([
            $user["user_id"],
            $tokenHash,
            $expiresAt
        ]);

        unset($user["password"]);

        respond([
            "success" => true,
            "message" => "Login successful.",
            "token" => $token,
            "expires_at" => $expiresAt,
            "user" => $user
        ]);
    }

    // =================================================
    // PUBLIC CUSTOMER REGISTRATION
    // POST /register
    // Public registration can create CUSTOMER accounts only.
    // Roles such as administrator, organiser and staff remain admin-managed.
    // =================================================

    if ($resource === "register" && $method === "POST") {
        $data = inputData();
        hasFields($data, ["name", "email", "password"]);

        $name = trim((string)$data["name"]);
        $email = trim((string)$data["email"]);
        $password = (string)$data["password"];

        if (strlen($name) < 2 || strlen($name) > 100) {
            respond([
                "success" => false,
                "message" => "Full name must be between 2 and 100 characters."
            ], 400);
        }

        if (strlen($email) > 150 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond([
                "success" => false,
                "message" => "Please enter a valid email address (maximum 150 characters)."
            ], 400);
        }

        if (strlen($password) < 8) {
            respond([
                "success" => false,
                "message" => "Password must be at least 8 characters long."
            ], 400);
        }

        // Email is unique in the existing users table.
        $check = $pdo->prepare("SELECT user_id FROM users WHERE email = ? LIMIT 1");
        $check->execute([$email]);
        if ($check->fetch(PDO::FETCH_ASSOC)) {
            respond([
                "success" => false,
                "message" => "That email address is already registered. Please sign in instead."
            ], 409);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        try {
            $insert = $pdo->prepare(
                "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'customer')"
            );
            $insert->execute([$name, $email, $passwordHash]);
        } catch (PDOException $e) {
            // Handle a duplicate-email race without exposing SQL details.
            if ($e->getCode() === "23000") {
                respond([
                    "success" => false,
                    "message" => "That email address is already registered. Please sign in instead."
                ], 409);
            }
            throw $e;
        }

        respond([
            "success" => true,
            "message" => "Registration successful. You can now sign in.",
            "user_id" => (int)$pdo->lastInsertId(),
            "role" => "customer"
        ], 201);
    }

    // =================================================
    // API STATUS
    // GET /api/index.php
    // =================================================

    if ($resource === "" && $method === "GET") {
        respond([
            "success" => true,
            "message" => "Event Ticketing REST API is running.",
            "endpoints" => [
                "POST /api/index.php/login",
                "POST /api/index.php/register",
                "GET /api/index.php/users",
                "GET /api/index.php/venues",
                "GET /api/index.php/events",
                "GET /api/index.php/bookings",
                "GET /api/index.php/holidays?year=2026"
            ]
        ]);
    }

    // All other endpoints require a valid token.
    $authenticatedUser = authenticateToken($pdo);

    // =================================================
    // USERS
    // =================================================

    if ($resource === "users") {

        requireRole($authenticatedUser, ["administrator"]);

        // GET users
        if ($method === "GET") {

            if ($id > 0) {
                $stmt = $pdo->prepare(
                    "SELECT user_id, name, email, role
                     FROM users
                     WHERE user_id = ?"
                );

                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                    respond([
                        "success" => false,
                        "message" => "User not found."
                    ], 404);
                }

                respond([
                    "success" => true,
                    "data" => $row
                ]);
            }

            $stmt = $pdo->query(
                "SELECT user_id, name, email, role
                 FROM users"
            );

            respond([
                "success" => true,
                "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)
            ]);
        }

        // CREATE user
        if ($method === "POST") {
            $data = inputData();

            hasFields($data, [
                "name", "email", "password", "role"
            ]);

            $allowedRoles = [
                "administrator",
                "organiser",
                "staff",
                "customer"
            ];

            if (!in_array($data["role"], $allowedRoles, true)) {
                respond([
                    "success" => false,
                    "message" => "Invalid role."
                ], 400);
            }

            if (!filter_var($data["email"], FILTER_VALIDATE_EMAIL)) {
                respond([
                    "success" => false,
                    "message" => "Invalid email address."
                ], 400);
            }

            $hash = password_hash(
                $data["password"],
                PASSWORD_DEFAULT
            );

            $stmt = $pdo->prepare(
                "INSERT INTO users (name, email, password, role)
                 VALUES (?, ?, ?, ?)"
            );

            $stmt->execute([
                $data["name"],
                $data["email"],
                $hash,
                $data["role"]
            ]);

            respond([
                "success" => true,
                "message" => "User created.",
                "user_id" => (int)$pdo->lastInsertId()
            ], 201);
        }

        // UPDATE user
        if ($method === "PUT" && $id > 0) {
            $data = inputData();

            hasFields($data, ["name", "email", "role"]);

            $allowedRoles = [
                "administrator",
                "organiser",
                "staff",
                "customer"
            ];

            if (!in_array($data["role"], $allowedRoles, true)) {
                respond([
                    "success" => false,
                    "message" => "Invalid role."
                ], 400);
            }

            if (!filter_var($data["email"], FILTER_VALIDATE_EMAIL)) {
                respond([
                    "success" => false,
                    "message" => "Invalid email address."
                ], 400);
            }

            $stmt = $pdo->prepare(
                "UPDATE users
                 SET name = ?, email = ?, role = ?
                 WHERE user_id = ?"
            );

            $stmt->execute([
                $data["name"],
                $data["email"],
                $data["role"],
                $id
            ]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "User updated."
                    : "No changes made, or user not found."
            ]);
        }

        // DELETE user
        if ($method === "DELETE" && $id > 0) {

            if ($id === (int)$authenticatedUser["user_id"]) {
                respond([
                    "success" => false,
                    "message" => "You cannot delete your own account."
                ], 403);
            }

            $stmt = $pdo->prepare(
                "DELETE FROM users WHERE user_id = ?"
            );

            $stmt->execute([$id]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "User deleted."
                    : "User not found."
            ]);
        }
    }

    // =================================================
    // VENUES
    // =================================================

    if ($resource === "venues") {

        // GET venues
        if ($method === "GET") {

            if ($id > 0) {
                $stmt = $pdo->prepare(
                    "SELECT * FROM venues WHERE venue_id = ?"
                );

                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                    respond([
                        "success" => false,
                        "message" => "Venue not found."
                    ], 404);
                }

                respond([
                    "success" => true,
                    "data" => $row
                ]);
            }

            $stmt = $pdo->query("SELECT * FROM venues");

            respond([
                "success" => true,
                "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)
            ]);
        }

        // CREATE venue
        if ($method === "POST") {
            requireRole($authenticatedUser, ["administrator"]);

            $data = inputData();

            hasFields($data, [
                "venue_name", "location", "capacity"
            ]);

            if (!is_numeric($data["capacity"]) || (int)$data["capacity"] <= 0) {
                respond([
                    "success" => false,
                    "message" => "Capacity must be a positive number."
                ], 400);
            }

            $stmt = $pdo->prepare(
                "INSERT INTO venues
                 (venue_name, location, capacity, description)
                 VALUES (?, ?, ?, ?)"
            );

            $stmt->execute([
                $data["venue_name"],
                $data["location"],
                $data["capacity"],
                $data["description"] ?? null
            ]);

            respond([
                "success" => true,
                "message" => "Venue created.",
                "venue_id" => (int)$pdo->lastInsertId()
            ], 201);
        }

        // UPDATE venue
        if ($method === "PUT" && $id > 0) {
            requireRole($authenticatedUser, ["administrator"]);

            $data = inputData();

            hasFields($data, [
                "venue_name", "location", "capacity"
            ]);

            $stmt = $pdo->prepare(
                "UPDATE venues
                 SET venue_name = ?, location = ?,
                     capacity = ?, description = ?
                 WHERE venue_id = ?"
            );

            $stmt->execute([
                $data["venue_name"],
                $data["location"],
                $data["capacity"],
                $data["description"] ?? null,
                $id
            ]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "Venue updated."
                    : "No changes made, or venue not found."
            ]);
        }

        // DELETE venue
        if ($method === "DELETE" && $id > 0) {
            requireRole($authenticatedUser, ["administrator"]);

            $stmt = $pdo->prepare(
                "DELETE FROM venues WHERE venue_id = ?"
            );

            $stmt->execute([$id]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "Venue deleted."
                    : "Venue not found."
            ]);
        }
    }

    // =================================================
    // EVENTS
    // Includes Search and Pagination
    // =================================================

    if ($resource === "events") {

        // GET events, search and pagination
        if ($method === "GET") {
            $sql = "SELECT e.*, v.venue_name
                    FROM events e
                    LEFT JOIN venues v
                    ON e.venue_id = v.venue_id";

            // GET one event by ID
            if ($id > 0) {
                $stmt = $pdo->prepare(
                    $sql . " WHERE e.event_id = ?"
                );

                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                    respond([
                        "success" => false,
                        "message" => "Event not found."
                    ], 404);
                }

                respond([
                    "success" => true,
                    "data" => $row
                ]);
            }

            // SEARCH by event name
            $search = trim($_GET["search"] ?? "");

            // PAGINATION
            $page = max(1, (int)($_GET["page"] ?? 1));
            $limit = (int)($_GET["limit"] ?? 5);
            $limit = max(1, min($limit, 50));
            $offset = ($page - 1) * $limit;

            $where = "";
            $params = [];

            if ($search !== "") {
                $where = " WHERE e.event_name LIKE ?";
                $params[] = "%" . $search . "%";
            }

            // Count matching events
            $countSql = "SELECT COUNT(*)
                         FROM events e" . $where;

            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();

            // Get events for the selected page
            $dataSql = $sql . $where
                     . " ORDER BY e.event_id DESC"
                     . " LIMIT " . $limit
                     . " OFFSET " . $offset;

            $stmt = $pdo->prepare($dataSql);
            $stmt->execute($params);

            respond([
                "success" => true,
                "page" => $page,
                "limit" => $limit,
                "total" => $total,
                "total_pages" => (int)ceil($total / $limit),
                "search" => $search,
                "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)
            ]);
        }

        // CREATE event
        if ($method === "POST") {
            requireRole($authenticatedUser, [
                "administrator",
                "organiser"
            ]);

            $data = inputData();

            hasFields($data, [
                "venue_id",
                "event_name",
                "description",
                "event_date",
                "ticket_price",
                "available_tickets"
            ]);

            if (
                !is_numeric($data["ticket_price"]) ||
                (float)$data["ticket_price"] < 0 ||
                !is_numeric($data["available_tickets"]) ||
                (int)$data["available_tickets"] < 0
            ) {
                respond([
                    "success" => false,
                    "message" => "Invalid ticket price or ticket quantity."
                ], 400);
            }

            $stmt = $pdo->prepare(
                "INSERT INTO events
                 (venue_id, event_name, description, event_date,
                  ticket_price, available_tickets)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );

            $stmt->execute([
                $data["venue_id"],
                $data["event_name"],
                $data["description"],
                $data["event_date"],
                $data["ticket_price"],
                $data["available_tickets"]
            ]);

            respond([
                "success" => true,
                "message" => "Event created.",
                "event_id" => (int)$pdo->lastInsertId()
            ], 201);
        }

        // UPDATE event
        if ($method === "PUT" && $id > 0) {
            requireRole($authenticatedUser, [
                "administrator",
                "organiser"
            ]);

            $data = inputData();

            hasFields($data, [
                "venue_id",
                "event_name",
                "description",
                "event_date",
                "ticket_price",
                "available_tickets"
            ]);

            $stmt = $pdo->prepare(
                "UPDATE events
                 SET venue_id = ?, event_name = ?,
                     description = ?, event_date = ?,
                     ticket_price = ?, available_tickets = ?
                 WHERE event_id = ?"
            );

            $stmt->execute([
                $data["venue_id"],
                $data["event_name"],
                $data["description"],
                $data["event_date"],
                $data["ticket_price"],
                $data["available_tickets"],
                $id
            ]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "Event updated."
                    : "No changes made, or event not found."
            ]);
        }

        // DELETE event
        if ($method === "DELETE" && $id > 0) {
            requireRole($authenticatedUser, [
                "administrator",
                "organiser"
            ]);

            $stmt = $pdo->prepare(
                "DELETE FROM events WHERE event_id = ?"
            );

            $stmt->execute([$id]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "Event deleted."
                    : "Event not found."
            ]);
        }
    }

    // =================================================
    // BOOKINGS
    // =================================================

    if ($resource === "bookings") {

        $role = $authenticatedUser["role"];
        $currentUserId = (int)$authenticatedUser["user_id"];

        // GET bookings
        if ($method === "GET") {
            $sql = "SELECT b.*, u.name AS customer_name,
                           e.event_name
                    FROM bookings b
                    JOIN users u ON b.user_id = u.user_id
                    JOIN events e ON b.event_id = e.event_id";

            $params = [];

            if ($role === "customer") {
                $sql .= " WHERE b.user_id = ?";
                $params[] = $currentUserId;
            }

            if ($id > 0) {
                $sql .= ($role === "customer"
                    ? " AND b.booking_id = ?"
                    : " WHERE b.booking_id = ?");

                $params[] = $id;

                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                    respond([
                        "success" => false,
                        "message" => "Booking not found."
                    ], 404);
                }

                respond([
                    "success" => true,
                    "data" => $row
                ]);
            }

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            respond([
                "success" => true,
                "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)
            ]);
        }

        // CREATE booking
        if ($method === "POST") {
            requireRole($authenticatedUser, [
                "administrator",
                "organiser",
                "customer"
            ]);

            $data = inputData();

            hasFields($data, ["event_id", "quantity"]);

            $eventId = (int)$data["event_id"];
            $quantity = (int)$data["quantity"];

            if ($eventId <= 0 || $quantity <= 0) {
                respond([
                    "success" => false,
                    "message" => "Invalid event ID or quantity."
                ], 400);
            }

            // Check event and available tickets
            $stmt = $pdo->prepare(
                "SELECT ticket_price, available_tickets
                 FROM events
                 WHERE event_id = ?"
            );

            $stmt->execute([$eventId]);
            $event = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$event) {
                respond([
                    "success" => false,
                    "message" => "Event not found."
                ], 404);
            }

            if ($quantity > (int)$event["available_tickets"]) {
                respond([
                    "success" => false,
                    "message" => "Not enough tickets available."
                ], 400);
            }

            $userId = $role === "customer"
                ? $currentUserId
                : (int)($data["user_id"] ?? $currentUserId);

            $totalPrice = $quantity * (float)$event["ticket_price"];
            $status = "pending";

            $stmt = $pdo->prepare(
                "INSERT INTO bookings
                 (user_id, event_id, quantity, total_price,
                  booking_status)
                 VALUES (?, ?, ?, ?, ?)"
            );

            $stmt->execute([
                $userId,
                $eventId,
                $quantity,
                $totalPrice,
                $status
            ]);

            respond([
                "success" => true,
                "message" => "Booking created.",
                "booking_id" => (int)$pdo->lastInsertId()
            ], 201);
        }

        // UPDATE booking
        if ($method === "PUT" && $id > 0) {
            requireRole($authenticatedUser, [
                "administrator",
                "organiser",
                "staff"
            ]);

            $data = inputData();

            hasFields($data, [
                "user_id",
                "event_id",
                "quantity",
                "total_price",
                "booking_status"
            ]);

            $allowedStatus = [
                "pending",
                "confirmed",
                "cancelled"
            ];

            if (!in_array(
                $data["booking_status"],
                $allowedStatus,
                true
            )) {
                respond([
                    "success" => false,
                    "message" => "Invalid booking status."
                ], 400);
            }

            $stmt = $pdo->prepare(
                "UPDATE bookings
                 SET user_id = ?, event_id = ?, quantity = ?,
                     total_price = ?, booking_status = ?
                 WHERE booking_id = ?"
            );

            $stmt->execute([
                $data["user_id"],
                $data["event_id"],
                $data["quantity"],
                $data["total_price"],
                $data["booking_status"],
                $id
            ]);

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "Booking updated."
                    : "No changes made, or booking not found."
            ]);
        }

        // DELETE booking
        if ($method === "DELETE" && $id > 0) {

            if ($role === "customer") {
                $stmt = $pdo->prepare(
                    "DELETE FROM bookings
                     WHERE booking_id = ? AND user_id = ?"
                );

                $stmt->execute([$id, $currentUserId]);

            } else {
                requireRole($authenticatedUser, [
                    "administrator"
                ]);

                $stmt = $pdo->prepare(
                    "DELETE FROM bookings
                     WHERE booking_id = ?"
                );

                $stmt->execute([$id]);
            }

            respond([
                "success" => true,
                "message" => $stmt->rowCount()
                    ? "Booking deleted."
                    : "Booking not found."
            ]);
        }
    }

    // =================================================
    // EXTERNAL API: MALAYSIA PUBLIC HOLIDAYS
    // GET /holidays?year=2026
    // =================================================

  

if ($resource === "holidays" && $method === "GET") {
    $year = (int)($_GET["year"] ?? date("Y"));

    if ($year < 2000 || $year > 2100) {
        respond([
            "success" => false,
            "message" => "Invalid year."
        ], 400);
    }

    $url = "https://malaysia-holiday.dydxsoft.my/api/v1/holidays?year=" . $year;

    $context = stream_context_create([
        "http" => [
            "timeout" => 20,
            "ignore_errors" => true,
            "header" => "Accept: application/json\r\n"
        ],
        "ssl" => [
            "verify_peer" => true,
            "verify_peer_name" => true
        ]
    ]);

    $result = @file_get_contents($url, false, $context);

    if ($result === false) {
        respond([
            "success" => false,
            "message" => "Unable to connect to Malaysia Holiday API. Please check the PHP internet connection."
        ], 502);
    }

    $holidayResponse = json_decode($result, true);

    

if (
    !is_array($holidayResponse) ||
    !isset($holidayResponse["data"]) ||
    !is_array($holidayResponse["data"])
) {
    respond([
        "success" => false,
        "message" => "Invalid response from Malaysia Holiday API."
    ], 502);
}

respond([
    "success" => true,
    "source" => "Malaysia Holiday API",
    "country" => "Malaysia",
    "year" => $year,
    "total" => $holidayResponse["meta"]["count"]
        ?? count($holidayResponse["data"]),
    "data" => $holidayResponse["data"]
]);

}

// =================================================
// FALLBACK: UNKNOWN ENDPOINT OR METHOD
// =================================================

respond([
    "success" => false,
    "message" => "Endpoint or HTTP method not supported."
], 404);

} catch (PDOException $e) {

    if ($e->getCode() == "23000") {
        respond([
            "success" => false,
            "message" => "Database constraint error. Check IDs and duplicate values."
        ], 409);
    }

    respond([
        "success" => false,
        "message" => "Database operation failed."
    ], 500);

} catch (Throwable $e) {

    respond([
        "success" => false,
        "message" => "Unexpected server error."
    ], 500);
}