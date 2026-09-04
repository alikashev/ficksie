<?php
/**
 * Reviews API
 * GET     /api/reviews          - List reviews (optional ?search=&status=&label=&platform=&rating=)
 * POST    /api/reviews          - Create a review
 * GET     /api/reviews/{id}     - Get a single review
 * PUT     /api/reviews/{id}     - Update a review
 * DELETE  /api/reviews/{id}     - Delete a review
 */

$method = $_SERVER['REQUEST_METHOD'];
$reviewId = $parts[1] ?? null;

$validLabels = ['Yourhosting', 'Versio', 'Argeweb', 'Hosting.nl'];
$validPlatforms = ['Trustpilot', 'Google', 'Webhosters'];
$validStatuses = ['Review Requested', 'Review Received'];

switch ($method) {
    case 'GET':
        if ($reviewId) {
            $review = Database::fetchOne(
                'SELECT r.*, u.username as created_by
                 FROM reviews r
                 LEFT JOIN users u ON r.user_id = u.id
                 WHERE r.id = ?',
                [$reviewId]
            );
            if (!$review) {
                Response::notFound('Review not found');
            }
            Response::success($review);
        } else {
            $search = $_GET['search'] ?? null;
            $status = $_GET['status'] ?? null;
            $label = $_GET['label'] ?? null;
            $platform = $_GET['platform'] ?? null;
            $rating = $_GET['rating'] ?? null;

            $sql = 'SELECT r.*, u.username as created_by FROM reviews r LEFT JOIN users u ON r.user_id = u.id';
            $params = [];
            $conditions = [];

            if ($search) {
                $conditions[] = '(r.ticket_number LIKE ? OR r.customer_name LIKE ?)';
                $term = '%' . $search . '%';
                $params[] = $term;
                $params[] = $term;
            }

            if ($status && in_array($status, $validStatuses)) {
                $conditions[] = 'r.status = ?';
                $params[] = $status;
            }

            if ($label && in_array($label, $validLabels)) {
                $conditions[] = 'r.label = ?';
                $params[] = $label;
            }

            if ($platform && in_array($platform, $validPlatforms)) {
                $conditions[] = 'r.platform = ?';
                $params[] = $platform;
            }

            if ($rating !== null && $rating !== '') {
                $conditions[] = 'r.rating = ?';
                $params[] = (int) $rating;
            }

            if (!empty($conditions)) {
                $sql .= ' WHERE ' . implode(' AND ', $conditions);
            }

            $sql .= ' ORDER BY r.created_at DESC';

            $reviews = Database::fetchAll($sql, $params);
            Response::success($reviews);
        }
        break;

    case 'POST':
        $user = require_auth();
        $body = get_json_body();

        $ticketNumber = trim($body['ticket_number'] ?? '');
        $customerName = trim($body['customer_name'] ?? '');
        $reviewDate = trim($body['review_date'] ?? '');
        $label = trim($body['label'] ?? '');
        $platform = trim($body['platform'] ?? '');
        $rating = $body['rating'] ?? null;
        $reviewLink = trim($body['review_link'] ?? '');
        $notes = trim($body['notes'] ?? '');
        $status = trim($body['status'] ?? 'Review Requested');

        $errors = [];
        if ($ticketNumber === '') $errors[] = 'Ticket number is required';
        if ($customerName === '') $errors[] = 'Customer name is required';
        if ($reviewDate === '') $errors[] = 'Review date is required';
        if (!in_array($label, $validLabels)) $errors[] = 'Invalid label';
        if (!in_array($platform, $validPlatforms)) $errors[] = 'Invalid platform';
        if (!in_array($status, $validStatuses)) $errors[] = 'Invalid status';
        if ($rating !== null && $rating !== '' && ((int)$rating < 1 || (int)$rating > 5)) $errors[] = 'Rating must be between 1 and 5';
        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $id = Database::insert(
            'INSERT INTO reviews (user_id, ticket_number, customer_name, review_date, label, platform, rating, review_link, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $user['id'],
                $ticketNumber,
                $customerName,
                $reviewDate,
                $label,
                $platform,
                $rating !== null && $rating !== '' ? (int) $rating : null,
                $reviewLink ?: null,
                $notes ?: null,
                $status,
            ]
        );

        $created = Database::fetchOne(
            'SELECT r.*, u.username as created_by FROM reviews r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?',
            [$id]
        );
        Response::created($created, 'Review created');
        break;

    case 'PUT':
        require_auth();
        if (!$reviewId) {
            Response::error('Review ID required', 400);
        }

        $existing = Database::fetchOne('SELECT * FROM reviews WHERE id = ?', [$reviewId]);
        if (!$existing) {
            Response::notFound('Review not found');
        }

        $body = get_json_body();
        $ticketNumber = trim($body['ticket_number'] ?? $existing['ticket_number']);
        $customerName = trim($body['customer_name'] ?? $existing['customer_name']);
        $reviewDate = trim($body['review_date'] ?? $existing['review_date']);
        $label = trim($body['label'] ?? $existing['label']);
        $platform = trim($body['platform'] ?? $existing['platform']);
        $rating = $body['rating'] ?? $existing['rating'];
        $reviewLink = trim($body['review_link'] ?? '');
        $notes = trim($body['notes'] ?? '');
        $status = trim($body['status'] ?? $existing['status']);

        $errors = [];
        if ($ticketNumber === '') $errors[] = 'Ticket number is required';
        if ($customerName === '') $errors[] = 'Customer name is required';
        if ($reviewDate === '') $errors[] = 'Review date is required';
        if (!in_array($label, $validLabels)) $errors[] = 'Invalid label';
        if (!in_array($platform, $validPlatforms)) $errors[] = 'Invalid platform';
        if (!in_array($status, $validStatuses)) $errors[] = 'Invalid status';
        if ($rating !== null && $rating !== '' && ((int)$rating < 1 || (int)$rating > 5)) $errors[] = 'Rating must be between 1 and 5';
        if (!empty($errors)) {
            Response::validationError($errors);
        }

        Database::execute(
            'UPDATE reviews SET ticket_number = ?, customer_name = ?, review_date = ?, label = ?, platform = ?, rating = ?, review_link = ?, notes = ?, status = ? WHERE id = ?',
            [
                $ticketNumber,
                $customerName,
                $reviewDate,
                $label,
                $platform,
                $rating !== null && $rating !== '' ? (int) $rating : null,
                $reviewLink ?: null,
                $notes ?: null,
                $status,
                $reviewId,
            ]
        );

        $updated = Database::fetchOne(
            'SELECT r.*, u.username as created_by FROM reviews r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?',
            [$reviewId]
        );
        Response::success($updated, 'Review updated');
        break;

    case 'DELETE':
        require_auth();
        if (!$reviewId) {
            Response::error('Review ID required', 400);
        }

        $existing = Database::fetchOne('SELECT * FROM reviews WHERE id = ?', [$reviewId]);
        if (!$existing) {
            Response::notFound('Review not found');
        }

        Database::execute('DELETE FROM reviews WHERE id = ?', [$reviewId]);
        Response::success(null, 'Review deleted');
        break;

    default:
        Response::error('Method not allowed', 405);
}
