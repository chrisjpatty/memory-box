---
description: "Your personal knowledge base, powered by AI. Save anything and find it again through natural conversation."
tags:
  - storage
  - semantic-search
  - mcp
capabilities:
  - Ingest arbitrary content
  - Search content with semantic search and natural language
  - Ingest and search via API or a chat UI
  - Import GitHub stars, and Twitter/X bookmarks
  - Connect via MCP to AI chat clients
integrations:
  - "anthropic"
  - "github"
  - "twitter"
  - "ollama"
---

<div align="center">
  <img src="https://i.ibb.co/zWGbfXJP/logo.png" alt="Memory Box" border="0" width="200">
</div>

<h1 align="center">memory-box</h1>

How many times have you searched for the exact wording of something you know you have saved and it never comes up? Search is fundamentally broken in so many services as it competes with the goal of keeping you running more and more searches. Memory Box is designed to let you pull all your saved content from other services into one place and use search tools that just work.

---

## What It Does

MemoryBox is a private AI agent that stores and retrieves your content. Send it a link, paste in a note, upload an image — it automatically classifies, tags, and indexes everything so you can search by meaning, not just keywords.

Ask it "what did I save last week about CSS animations?" and it finds the relevant articles, notes, and code repos across your entire collection.

Out of the box you get simple API access protected by bearer tokens and an MCP server that you can plug into chat clients like Claude or ChatGPT and get a one-click install.

## Features

### Save Anything

Drop in any content and MemoryBox handles the rest:

- **Links & Articles** — saves the full content, not just the URL
- **Notes & Text** — quick thoughts, ideas, quotes, reminders
- **Images** — analyzes visual content so you can search by what's in the picture
- **Tweets** — preserves the post with author, metrics, and context
- **GitHub Repos** — captures README, metadata, and key details

### Natural Language Search

Every item is automatically:

- Ingested with vector embeddings for fast semantic search
- Classified and tagged into a categories and topics
- Deduplicated so you never save the same thing twice

### Bulk Import

Bring in content from the platforms you already use:

- **GitHub** — import your starred repositories
- **Twitter/X** — import your bookmarks, organized by folder
- **More to come...**

### Dashboard

A web interface for browsing, searching, and managing your memories. Upload files, review imports, generate API tokens, and explore your collection visually.

![Screenshot of the Memory Box search interface](https://i.ibb.co/KcScSJcW/Screenshot-2026-04-14-at-1-30-00-PM.png)

### API & MCP Access

Integrate MemoryBox into your workflow:

- **REST API** for programmatic ingestion and search
- **MCP server** so AI assistants like Claude can read and write to your memory store directly
