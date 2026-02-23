# Бизнес-Диагностика 2.0

Telegram-бот для экспресс-диагностики бизнеса: 10 вопросов, анализ через OpenAI, воронка лидов (консультация / запись).

## Стек

- **Next.js 14+** (App Router), TypeScript
- **grammy** — Telegram Bot API
- **@vercel/kv** (Upstash Redis) — сессии и состояние
- **OpenAI** — разбор ответов и рекомендации
- **Vercel** — деплой (serverless)

## Локальный запуск

1. Клонируйте репозиторий и установите зависимости:
   ```bash
   npm install
   ```

2. Скопируйте переменные окружения:
   ```bash
   cp .env.example .env.local
   ```
   Заполните в `.env.local`:
   - `TELEGRAM_BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather)
   - `OPENAI_API_KEY` — ключ OpenAI
   - `KV_REST_API_URL` и `KV_REST_API_TOKEN` — из Vercel Dashboard → Storage → KV (или Upstash)
   - `ADMIN_ID` — ваш Telegram ID (число)
   - `VIDEO_NOTE_ID` — по желанию (см. ниже)
   - `VERCEL_URL` — для локальной отладки с вебхуком нужен публичный URL (например, ngrok)

3. Запуск:
   ```bash
   npm run dev
   ```

4. Для приёма обновлений локально используйте ngrok и вебхук:
   ```text
   https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://<ВАШ_NGROK_ДОМЕН>/api/bot
   ```

## Деплой на Vercel

1. **Проект**
   - Импортируйте репозиторий в Vercel, выберите Next.js.

2. **KV (Redis)**
   - Vercel Dashboard → Storage → Create Database → KV (Redis).
   - Привяжите базу к проекту.
   - В настройках проекта появятся `KV_REST_API_URL` и `KV_REST_API_TOKEN` (дублировать в Environment Variables не обязательно, если уже подставлены).

3. **Переменные окружения**
   - В проекте Vercel задайте:
     - `TELEGRAM_BOT_TOKEN`
     - `OPENAI_API_KEY`
     - `OPENAI_MODEL` (по желанию, по умолчанию `gpt-4o-mini`)
     - `KV_REST_API_URL`, `KV_REST_API_TOKEN` (если не подставились из Storage)
     - `ADMIN_ID`
     - `VIDEO_NOTE_ID` (по желанию)
   - `VERCEL_URL` задаётся автоматически.

4. **Вебхук Telegram**
   После деплоя один раз укажите Telegram URL вебхука (в браузере или curl):
   ```text
   https://api.telegram.org/bot<ТВОЙ_ТОКЕН>/setWebhook?url=https://<ТВОЙ_ДОМЕН_VERCEL>/api/bot
   ```
   Пример: `https://api.telegram.org/bot123:ABC/setWebhook?url=https://my-bot.vercel.app/api/bot`

   В ответ должно прийти: `{"ok":true,"result":true,"description":"Webhook was set"}`.

## Видео-кружок (VIDEO_NOTE_ID)

Чтобы бот отправлял видео-кружок в блоке «Обо мне», нужен `file_id` этого кружка в Telegram.

1. Отправьте нужный видео-кружок боту (или отладочному боту).
2. В логах или через getUpdates найдите в сообщении `message.video_note.file_id`.
3. Скопируйте значение в переменную `VIDEO_NOTE_ID` в Vercel (или `.env.local`).

Если `VIDEO_NOTE_ID` не задан, бот просто не будет отправлять видео (остальной сценарий работает).

## Структура проекта

- `app/api/bot/route.ts` — вебхук (POST), точка входа для Telegram.
- `lib/bot.ts` — инициализация grammy, сессия, команды и сценарии.
- `lib/redis.ts` — работа с сессией в Vercel KV.
- `lib/types.ts` — типы состояния сессии.
- `lib/openai.ts` — запрос к OpenAI для анализа ответов.
- `constants/texts.ts` — тексты и вопросы бота.

## Логика и сценарии

- **/start** — сброс сессии, приветствие, кнопка «Пройти экспресс-диагностику».
- **Опрос** — 10 вопросов, ответы 1–10, сохранение в KV.
- **После 10-го ответа** — уведомление админу, вызов OpenAI, отправка анализа пользователю, вопрос «Хотите консультацию?» (ДА / НЕТ).
- **ДА** — текст «Обо мне», видео-кружок (если есть), кнопка «Кейсы», приглашение записаться; по нажатию «Записаться» пользователь пишет варианты времени; сообщение пересылается админу, сессия сбрасывается.
- **НЕТ** — предложение подписаться на канал, сброс сессии.

Состояние (шаг опроса, ответы, шаг воронки) хранится в Redis по `chat_id`, поэтому бот корректно работает в serverless без потери контекста.
