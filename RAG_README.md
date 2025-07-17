# Discord RAG Bot

A Discord bot with RAG (Retrieval-Augmented Generation) capabilities using OpenRouter API and vector database for conversation memory.

## Features

- 🤖 **Multiple AI Models**: Access to free and paid models via OpenRouter
- 🧠 **Conversation Memory**: Vector database for semantic search of conversation history
- 💾 **Persistent Storage**: Redis for caching and recent conversation history
- 🔍 **Smart Context**: Retrieves relevant past conversations for better responses
- 🔧 **Easy Setup**: Simple commands for API key management and model selection

## Setup

### 1. Install Dependencies

```bash
npm install axios uuid
```

### 2. Start Infrastructure

Start Redis and Qdrant (vector database) using Docker:

```bash
docker-compose up -d
```

This will start:
- Redis on port 6379
- Qdrant vector database on port 6333

### 3. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Update your Discord bot token and client ID in `.env`.

### 4. Start the Bot

```bash
node index.js
```

## Usage

### Initial Setup

1. **Setup API Key** (per user):
   ```
   !rag setup YOUR_OPENROUTER_API_KEY
   ```

2. **List Available Models**:
   ```
   !rag models          # Show free models
   !rag models paid     # Show paid models
   ```

3. **Select a Model**:
   ```
   !rag select mistralai/mistral-7b-instruct:free
   ```

### Chatting

Once setup is complete, you can chat in several ways:

```bash
# Using the chat subcommand
!rag chat Hello, how are you?

# Direct chat (shorter)
!rag Hello, how are you?
```

### Advanced Features

- **Search Conversation History**:
  ```
  !rag search machine learning
  ```

- **Clear History**:
  ```
  !rag clear
  ```

- **Change Models**: 
  ```
  !rag select openai/gpt-3.5-turbo
  ```
  The new model will have access to your conversation history.

## How It Works

### Memory System

The bot uses a dual-memory approach:

1. **Redis Cache**: Stores recent conversation history (last 10 exchanges) for quick access
2. **Vector Database**: Stores all conversations as embeddings for semantic search

When you send a message:

1. Recent conversation history is retrieved from Redis
2. Similar past conversations are found using vector search
3. Both contexts are sent to the AI model
4. The response is stored in both Redis and the vector database

### Model Support

The bot supports all OpenRouter models, including:

**Free Models:**
- mistralai/mistral-7b-instruct:free
- microsoft/phi-3-mini-128k-instruct:free
- huggingfaceh4/zephyr-7b-beta:free
- openchat/openchat-7b:free

**Popular Paid Models:**
- openai/gpt-4
- openai/gpt-3.5-turbo
- anthropic/claude-3-sonnet
- google/gemini-pro

## Architecture

```
User Message
     ↓
[Redis Cache] ← Recent History
     ↓
[Vector DB] ← Semantic Search
     ↓
[Context Assembly]
     ↓
[OpenRouter API] → AI Response
     ↓
[Store in Redis + Vector DB]
     ↓
Send to Discord
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `!rag setup <api_key>` | Store your OpenRouter API key |
| `!rag models` | List free models |
| `!rag models paid` | List paid models |
| `!rag select <model_id>` | Select a model to use |
| `!rag chat <message>` | Chat with the AI |
| `!rag <message>` | Direct chat (shorthand) |
| `!rag search <query>` | Search conversation history |
| `!rag clear` | Clear conversation history |

## Troubleshooting

### Vector Database Issues

If you get vector database errors:

1. Ensure Qdrant is running: `docker-compose ps`
2. Check Qdrant logs: `docker-compose logs qdrant`
3. Restart services: `docker-compose restart`

### API Key Issues

- Ensure your OpenRouter API key is valid
- Check if you have credits/quota available
- Re-setup your API key: `!rag setup <new_key>`

### Model Errors

- Some models may have usage limits
- Try switching to a different model
- Check OpenRouter status page

## Data Storage

- **User API Keys**: Stored in Redis (30 days TTL)
- **Model Selections**: Stored in Redis (30 days TTL)
- **Recent Conversations**: Stored in Redis (7 days TTL)
- **All Conversations**: Stored in Qdrant vector database (permanent until manually cleared)

## Privacy

- Conversations are stored locally in your infrastructure
- API keys are encrypted and stored temporarily
- Each user's data is isolated by user ID and channel ID
- Users can clear their own history at any time
