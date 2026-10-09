// ============================================================
// «Аура красоты» — бэкенд салона (Go + gin + PostgreSQL).
//
// Запуск:
//   go mod tidy
//   go run .
// Переменные окружения см. в .env.example.
// ============================================================
package main

import (
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Category struct {
	ID   int    `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
	Sort int    `json:"sort"`
}

type Product struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CategoryID  int    `json:"category_id"`
	Price       int    `json:"price"`
	Discount    int    `json:"discount"`
	Sort        int    `json:"sort"`
	Photo       string `json:"photo"`
	Active      bool   `json:"active"`
}

type OrderItem struct {
	ProductID int    `json:"product_id"`
	Name      string `json:"name"`
	Qty       int    `json:"qty"`
	UnitPrice int    `json:"unit_price"`
	Sum       int    `json:"sum"`
}

type Order struct {
	ID           int         `json:"id"`
	CustomerName string      `json:"customer_name"`
	Phone        string      `json:"phone"`
	Comment      string      `json:"comment"`
	Delivery     string      `json:"delivery"`
	Total        int         `json:"total"`
	Status       string      `json:"status"`
	CreatedAt    string      `json:"created_at"`
	Items        []OrderItem `json:"items"`
}

type orderRequest struct {
	CustomerName string `json:"customer_name"`
	Phone        string `json:"phone"`
	Comment      string `json:"comment"`
	Delivery     string `json:"delivery"`
	Items        []struct {
		ProductID int `json:"product_id"`
		Qty       int `json:"qty"`
	} `json:"items"`
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	cfg := config{
		databaseURL:   env("DATABASE_URL", "postgres://aura:aura@localhost:5432/aura?sslmode=disable"),
		adminPassword: env("ADMIN_PASSWORD", "aura2026"),
		authSecret:    env("AUTH_SECRET", "aura-dev-secret-change-me"),
		tgBotToken:    env("TG_BOT_TOKEN", ""),
		tgChatID:      env("TG_CHAT_ID", ""),
		port:          env("PORT", "8080"),
	}

	pool, err := connectDB(cfg.databaseURL)
	if err != nil {
		log.Fatalf("[db] не удалось подключиться к PostgreSQL: %v", err)
	}
	defer pool.Close()
	log.Println("[db] подключено к PostgreSQL")

	if err := migrate(pool); err != nil {
		log.Fatalf("[db] миграции: %v", err)
	}

	r := gin.Default()
	r.MaxMultipartMemory = 8 << 20

	// CORS — чтобы фронтенд с Live Server (:5500) обращался к API на :8080
	r.Use(corsMiddleware())

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

		// публичные
		api.GET("/categories", listCategories(pool))
		api.GET("/products", listProducts(pool))
		api.GET("/services", listServices(pool))
		api.GET("/works", listWorks(pool))
		api.POST("/orders", createOrder(pool, &cfg))
		api.POST("/appointments", createAppointment(pool, &cfg))

		// админ
		api.POST("/admin/login", login(&cfg))
		auth := api.Group("/admin", authRequired(cfg.authSecret))
		{
			auth.GET("/me", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

			auth.GET("/orders", listOrders(pool))
			auth.PUT("/orders/:id/status", updateOrderStatus(pool))
			auth.DELETE("/orders/:id", deleteOrder(pool))

			auth.GET("/appointments", listAppointments(pool))
			auth.PUT("/appointments/:id/status", updateAppointmentStatus(pool))
			auth.DELETE("/appointments/:id", deleteAppointment(pool))

			auth.POST("/services", createService(pool))
			auth.PUT("/services/:id", updateService(pool))
			auth.PATCH("/services/:id", patchService(pool))
			auth.DELETE("/services/:id", deleteService(pool))

			auth.POST("/works", createWork(pool))
			auth.PUT("/works/:id", updateWork(pool))
			auth.PATCH("/works/:id", patchWork(pool))
			auth.DELETE("/works/:id", deleteWork(pool))

			auth.POST("/products", createProduct(pool))
			auth.PUT("/products/:id", updateProduct(pool))
			auth.PATCH("/products/:id", patchProduct(pool))
			auth.DELETE("/products/:id", deleteProduct(pool))

			auth.POST("/categories", createCategory(pool))
			auth.PUT("/categories/:id", updateCategory(pool))
			auth.DELETE("/categories/:id", deleteCategory(pool))

			auth.POST("/upload", uploadFile())
		}
	}

	// раздача загруженных фото (в проде это делает nginx)
	r.Static("/uploads", "./uploads")

	log.Printf("[api] слушаю http://localhost:%s", cfg.port)
	if err := r.Run(":" + cfg.port); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func atoiParam(c *gin.Context, name string) (int, bool) {
	v, err := strconv.Atoi(c.Param(name))
	return v, err == nil
}
