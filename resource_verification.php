<?php
require_once 'config.php';

try {
    $tables = ['users', 'events', 'venues', 'bookings'];
    $results = [];

    foreach ($tables as $table) {
        $stmt = $pdo->query(
            "SELECT COUNT(*) AS total FROM `$table`"
        );

        $row = $stmt->fetch();

        $results[$table] = [
            'exists' => true,
            'records' => (int) $row['total']
        ];
    }

    respond(200, [
        'success' => true,
        'message' => 'Resource verification completed',
        'resources' => $results
    ]);
} catch (PDOException $e) {
    respond(500, [
        'success' => false,
        'message' => 'Resource verification failed'
    ]);
}