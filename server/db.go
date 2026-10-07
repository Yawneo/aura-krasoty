package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

/* ============================================================
   База данных
   ============================================================ */

type config struct {
	databaseURL   string
	adminPassword string
	authSecret    string
	tgBotToken    string
	tgChatID      string
	port          string
}

func connectDB(url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 8
	return pgxpool.NewWithConfig(context.Background(), cfg)
}

// migrate применяет SQL-файлы из ./migrations (по порядку имени).
func migrate(pool *pgxpool.Pool) error {
	if err := pool.Exec(context.Background(),
		`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`); err != nil {
		return err
	}
	entries, err := os.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		var exists bool
		err := pool.QueryRow(context.Background(),
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, e.Name()).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		sqlBytes, err := os.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		tx, err := pool.Begin(context.Background())
		if err != nil {
			return err
		}
		if _, err := tx.Exec(context.Background(), string(sqlBytes)); err != nil {
			_ = tx.Rollback(context.Background())
			return fmt.Errorf("%s: %w", e.Name(), err)
		}
		if _, err := tx.Exec(context.Background(),
			`INSERT INTO schema_migrations(name) VALUES ($1)`, e.Name()); err != nil {
			_ = tx.Rollback(context.Background())
			return err
		}
		if err := tx.Commit(context.Background()); err != nil {
			return err
		}
		log.Printf("[db] применена миграция %s", e.Name())
	}
	return nil
}

/* ============================================================
   Авторизация: HMAC-токен Bearer
   ============================================================ */

func makeToken(secret string, ttl time.Duration) string {
	payload, _ := json.Marshal(map[string]int64{"exp": time.Now().Add(ttl).Unix()})
	body := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return body + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func checkToken(secret, token string) bool {
	body, sig, ok := strings.Cut(token, ".")
	if !ok {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(want)) {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return false
	}
	var payload map[string]int64
	if err := json.Unmarshal(raw, &payload); err != nil {
		return false
	}
	return payload["exp"] > time.Now().Unix()
}

func authRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || !checkToken(secret, token) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
			return
		}
		c.Next()
	}
}

func login(cfg *config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Password != cfg.adminPassword {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный пароль"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": makeToken(cfg.authSecret, 7*24*time.Hour)})
	}
}

/* ============================================================
   Категории
   ============================================================ */

func listCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := pool.Query(context.Background(),
			`SELECT id, slug, name, sort FROM categories ORDER BY sort, id`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		cats := []Category{}
		for rows.Next() {
			var cat Category
			if err := rows.Scan(&cat.ID, &cat.Slug, &cat.Name, &cat.Sort); err == nil {
				cats = append(cats, cat)
			}
		}
		c.JSON(http.StatusOK, cats)
	}
}

func createCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var cat Category
		if err := c.ShouldBindJSON(&cat); err != nil || cat.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нужно поле name"})
			return
		}
		if cat.Slug == "" {
			cat.Slug = fmt.Sprintf("cat-%d", time.Now().UnixNano()%100000)
		}
		err := pool.QueryRow(context.Background(),
			`INSERT INTO categories(slug, name, sort) VALUES ($1,$2,$3) RETURNING id`,
			cat.Slug, cat.Name, cat.Sort).Scan(&cat.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, cat)
	}
}

func updateCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		var cat Category
		if err := c.ShouldBindJSON(&cat); err != nil || cat.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нужно поле name"})
			return
		}
		tag, err := pool.Exec(context.Background(),
			`UPDATE categories SET name=$1, sort=$2 WHERE id=$3`, cat.Name, cat.Sort, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Категория не найдена"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func deleteCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		var n int
		_ = pool.QueryRow(context.Background(),
			`SELECT count(*) FROM products WHERE category_id=$1`, id).Scan(&n)
		if n > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("В категории %d товаров — сначала перенесите или удалите их", n)})
			return
		}
		tag, err := pool.Exec(context.Background(), `DELETE FROM categories WHERE id=$1`, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Категория не найдена"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

/* ============================================================
   Товары
   ============================================================ */

func listProducts(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		all := c.Query("all") == "1"
		query := `SELECT id, name, description, category_id, price, discount, sort, photo, active FROM products`
		if !all {
			query += ` WHERE active`
		}
		query += ` ORDER BY sort, id`
		rows, err := pool.Query(context.Background(), query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		items := []Product{}
		for rows.Next() {
			var p Product
			if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.CategoryID, &p.Price,
				&p.Discount, &p.Sort, &p.Photo, &p.Active); err == nil {
				items = append(items, p)
			}
		}
		c.JSON(http.StatusOK, items)
	}
}

func createProduct(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p Product
		if err := c.ShouldBindJSON(&p); err != nil || p.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нужно поле name"})
			return
		}
		err := pool.QueryRow(context.Background(),
			`INSERT INTO products(name, description, category_id, price, discount, sort, photo, active)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
			p.Name, p.Description, p.CategoryID, p.Price, p.Discount, p.Sort, p.Photo, p.Active).Scan(&p.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, p)
	}
}

func updateProduct(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		var p Product
		if err := c.ShouldBindJSON(&p); err != nil || p.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нужно поле name"})
			return
		}
		tag, err := pool.Exec(context.Background(),
			`UPDATE products SET name=$1, description=$2, category_id=$3, price=$4, discount=$5, sort=$6, photo=$7, active=$8 WHERE id=$9`,
			p.Name, p.Description, p.CategoryID, p.Price, p.Discount, p.Sort, p.Photo, p.Active, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Товар не найден"})
			return
		}
		p.ID = id
		c.JSON(http.StatusOK, p)
	}
}

func patchProduct(pool *pgxpool.Pool) gin.HandlerFunc {
	// PATCH /admin/products/:id { "active": true|false } — временное скрытие
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		var body struct {
			Active *bool `json:"active"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Active == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ожидалось поле active"})
			return
		}
		tag, err := pool.Exec(context.Background(),
			`UPDATE products SET active=$1 WHERE id=$2`, *body.Active, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Товар не найден"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func deleteProduct(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		tag, err := pool.Exec(context.Background(), `DELETE FROM products WHERE id=$1`, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Товар не найден"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

/* ============================================================
   Заказы
   ============================================================ */

func createOrder(pool *pgxpool.Pool, cfg *config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req orderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный запрос"})
			return
		}
		if strings.TrimSpace(req.CustomerName) == "" || strings.TrimSpace(req.Phone) == "" || len(req.Items) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите имя, телефон и хотя бы один товар"})
			return
		}
		if req.Delivery != "courier" {
			req.Delivery = "pickup"
		}

		ctx := context.Background()
		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(ctx)

		// Считаем суммы на сервере по актуальным ценам из БД
		items := []OrderItem{}
		total := 0
		for _, it := range req.Items {
			if it.Qty <= 0 {
				continue
			}
			var name string
			var price, discount int
			err := tx.QueryRow(ctx,
				`SELECT name, price, discount FROM products WHERE id=$1 AND active`, it.ProductID,
			).Scan(&name, &price, &discount)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Товар #%d недоступен", it.ProductID)})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			unit := price * (100 - discount) / 100
			sum := unit * it.Qty
			total += sum
			items = append(items, OrderItem{
				ProductID: it.ProductID, Name: name, Qty: it.Qty, UnitPrice: unit, Sum: sum,
			})
		}
		if len(items) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Корзина пуста"})
			return
		}

		var orderID int
		var createdAt time.Time
		err = tx.QueryRow(ctx,
			`INSERT INTO orders(customer_name, phone, comment, delivery, total, status)
			 VALUES ($1,$2,$3,$4,$5,'new') RETURNING id, created_at`,
			req.CustomerName, req.Phone, req.Comment, req.Delivery, total).Scan(&orderID, &createdAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		for _, it := range items {
			if _, err := tx.Exec(ctx,
				`INSERT INTO order_items(order_id, product_id, name, qty, unit_price, sum) VALUES ($1,$2,$3,$4,$5,$6)`,
				orderID, it.ProductID, it.Name, it.Qty, it.UnitPrice, it.Sum); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		order := Order{
			ID: orderID, CustomerName: req.CustomerName, Phone: req.Phone, Comment: req.Comment,
			Delivery: req.Delivery, Total: total, Status: "new",
			CreatedAt: createdAt.Format(time.RFC3339), Items: items,
		}

		// уведомление в Telegram — не блокируем ответ покупателю
		go notifyTelegram(cfg, order)

		c.JSON(http.StatusOK, order)
	}
}

func listOrders(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := context.Background()
		rows, err := pool.Query(ctx,
			`SELECT id, customer_name, phone, comment, delivery, total, status, created_at
			 FROM orders ORDER BY created_at DESC`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		orders := []Order{}
		ids := []int{}
		for rows.Next() {
			var o Order
			var createdAt time.Time
			if err := rows.Scan(&o.ID, &o.CustomerName, &o.Phone, &o.Comment, &o.Delivery,
				&o.Total, &o.Status, &createdAt); err == nil {
				o.CreatedAt = createdAt.Format(time.RFC3339)
				orders = append(orders, o)
				ids = append(ids, o.ID)
			}
		}
		rows.Close()

		for i := range orders {
			items := []OrderItem{}
			irows, err := pool.Query(ctx,
				`SELECT product_id, name, qty, unit_price, sum FROM order_items WHERE order_id=$1`, orders[i].ID)
			if err == nil {
				for irows.Next() {
					var it OrderItem
					var pid *int
					if err := irows.Scan(&pid, &it.Name, &it.Qty, &it.UnitPrice, &it.Sum); err == nil {
						if pid != nil {
							it.ProductID = *pid
						}
						items = append(items, it)
					}
				}
				irows.Close()
			}
			orders[i].Items = items
		}
		c.JSON(http.StatusOK, orders)
	}
}

func updateOrderStatus(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ожидалось поле status"})
			return
		}
		if body.Status != "new" && body.Status != "delivered" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Статус может быть new или delivered"})
			return
		}
		tag, err := pool.Exec(context.Background(),
			`UPDATE orders SET status=$1 WHERE id=$2`, body.Status, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Заказ не найден"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func deleteOrder(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := atoiParam(c, "id")
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный id"})
			return
		}
		tag, err := pool.Exec(context.Background(), `DELETE FROM orders WHERE id=$1`, id)
		if err != nil || tag.RowsAffected() == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Заказ не найден"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

/* ============================================================
   Онлайн-запись на услуги
   ============================================================ */

type Appointment struct {
	ID           int    `json:"id"`
	CustomerName string `json:"customer_name"`
	Phone        string `json:"phone"`
	Service      string `json:"service"`
	Master       string `json:"master"`
	Date         string `json:"date"`
	Time         string `json:"time"`
	Comment      string `json:"comment"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`
}

func createAppointment(pool *pgxpool.Pool, cfg *config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var a Appointment
		if err := c.ShouldBindJSON(&a); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный запрос"})
			return
		}
		if strings.TrimSpace(a.CustomerName) == "" || strings.TrimSpace(a.Phone) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите имя и телефон"})
			return
		}
		var id int
		var createdAt time.Time
		err := pool.QueryRow(context.Background(),
			`INSERT INTO appointments(customer_name, phone, service, master, date, time, comment)
			 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
			a.CustomerName, a.Phone, a.Service, a.Master, a.Date, a.Time, a.Comment).Scan(&id, &createdAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		a.ID, a.Status = id, "new"
		a.CreatedAt = createdAt.Format(time.RFC3339)

		// уведомление в Telegram — не блокируем ответ
		go notifyTelegramBooking(cfg, a)

		c.JSON(http.StatusOK, a)
	}
}

/* ============================================================
   Загрузка фото товаров
   ============================================================ */

func uploadFile() gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нет файла в поле file"})
			return
		}
		ext := strings.ToLower(file.Filename)
		if i := strings.LastIndex(ext, "."); i >= 0 {
			ext = ext[i:]
		} else {
			ext = ""
		}
		switch ext {
		case ".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif":
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Разрешены jpg, png, webp, svg, gif"})
			return
		}
		name := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		if err := c.SaveUploadedFile(file, "uploads/"+name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"url": "/uploads/" + name})
	}
}
