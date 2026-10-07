package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

/* ============================================================
   Telegram-уведомления о новых заказах.
   Заполните TG_BOT_TOKEN и TG_CHAT_ID в .env — и каждый заказ
   будет приходить боту. Пока переменные пустые, уведомление
   просто пишется в лог сервера.
   ============================================================ */

func notifyTelegram(cfg *config, o Order) {
	text := formatOrderText(o)
	sendTelegram(cfg, text, fmt.Sprintf("заказ №%d", o.ID))
}

func notifyTelegramBooking(cfg *config, a Appointment) {
	var b strings.Builder
	b.WriteString("📅 *Новая запись* — Аура красоты\n\n")
	b.WriteString(fmt.Sprintf("👤 %s\n📞 %s\n", a.CustomerName, a.Phone))
	if a.Service != "" {
		b.WriteString(fmt.Sprintf("✂️ %s\n", a.Service))
	}
	if a.Date != "" || a.Time != "" {
		b.WriteString(fmt.Sprintf("🗓 %s %s\n", a.Date, a.Time))
	}
	if a.Comment != "" {
		b.WriteString(fmt.Sprintf("💬 %s\n", a.Comment))
	}
	sendTelegram(cfg, b.String(), fmt.Sprintf("запись %s", a.CustomerName))
}

func sendTelegram(cfg *config, text, label string) {
	if cfg.tgBotToken == "" || cfg.tgChatID == "" {
		log.Printf("[telegram] TG_BOT_TOKEN/TG_CHAT_ID не заданы — %s только в логе:\n%s", label, text)
		return
	}

	api := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cfg.tgBotToken)
	payload := url.Values{}
	payload.Set("chat_id", cfg.tgChatID)
	payload.Set("text", text)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.PostForm(api, payload)
	if err != nil {
		log.Printf("[telegram] ошибка отправки: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var out map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&out)
		log.Printf("[telegram] Telegram ответил %d: %v", resp.StatusCode, out)
	}
}

func formatOrderText(o Order) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("🌸 *Новый заказ №%d* — Аура красоты\n\n", o.ID))
	b.WriteString(fmt.Sprintf("👤 %s\n📞 %s\n", o.CustomerName, o.Phone))
	if o.Comment != "" {
		b.WriteString(fmt.Sprintf("💬 %s\n", o.Comment))
	}
	if o.Delivery == "courier" {
		b.WriteString("🚗 Доставка по Сургуту\n")
	} else {
		b.WriteString("🏪 Самовывоз — Тюменский тракт, 4\n")
	}
	b.WriteString("\n🧺 *Состав:*\n")
	for _, it := range o.Items {
		b.WriteString(fmt.Sprintf("• %s × %d — %d ₽\n", it.Name, it.Qty, it.Sum))
	}
	b.WriteString(fmt.Sprintf("\n💰 *Итого: %d ₽*", o.Total))
	return b.String()
}
