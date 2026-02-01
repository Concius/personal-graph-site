# Personal Graph Site

A 3D graph-based personal website powered by Notion as a CMS.

## Features

- **3D Force-Directed Graph**: Navigate your content spatially
- **Notion Integration**: Manage content from Notion, updates automatically
- **Windowing System**: Desktop-like experience with draggable, resizable windows
- **Search**: Find nodes by name, description, or cluster
- **Minimap**: Bird's-eye view of your graph
- **Clusters**: Automatic grouping and color theming

## Prerequisites

- Node.js 18+ installed
- A Notion account
- Vercel account (for deployment)

## Setup

### 1. Create Your Notion Database

1. Open Notion and create a new **Full Page Database**
2. Name it "Graph Nodes" (or whatever you prefer)
3. Add these properties:

| Property | Type | Description |
|----------|------|-------------|
| Name | Title | Node display name (required) |
| Slug | Text | Unique ID for URLs, e.g., "my-project" |
| Group | Select | Cluster name: Core, LLM, Research, Creative, Meta |
| Weight | Number | Node size (1-10, default: 3) |
| Description | Text | Short summary for search/preview |
| Links To | Multi-select | Slugs of connected nodes |
| Color | Text | Hex color for the group, e.g., "#10b981" |
| BgLight | Text | Light gradient color, e.g., "#d1fae5" |
| BgDark | Text | Dark gradient color, e.g., "#022c22" |

4. Add some test entries to your database

### 2. Create Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Name it "Graph Site"
4. Select your workspace
5. Click **Submit**
6. Copy the **Internal Integration Secret** (starts with `ntn_`)

### 3. Connect Integration to Database

1. Open your Notion database
2. Click **"..."** (menu) in the top right
3. Click **"Connections"** → **"Add connections"**
4. Find and select your "Graph Site" integration

### 4. Get Database ID

1. Open your database in Notion
2. Look at the URL: `https://notion.so/your-workspace/DATABASE_ID?v=...`
3. Copy the `DATABASE_ID` part (it's a long string with dashes)

### 5. Local Development

```bash
# Clone/download the project
cd personal-graph-site

# Install dependencies
npm install

# Create .env file for local development
cp .env.example .env.local

# Edit .env.local and add your credentials:
# NOTION_API_KEY=ntn_your_key_here
# NOTION_DATABASE_ID=your_database_id_here

# Start development server (uses Vercel dev)
npm run dev
```

Open `http://localhost:3000` in your browser.

### 6. Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. In **Environment Variables**, add:
   - `NOTION_API_KEY` = your integration secret
   - `NOTION_DATABASE_ID` = your database ID
4. Click **Deploy**

## Content Guide

### Adding Nodes

1. Create a new page in your Notion database
2. Fill in the properties:
   - **Name**: Display title
   - **Slug**: URL-safe ID (lowercase, hyphens)
   - **Group**: Select a cluster
   - **Weight**: 1-10 (bigger = larger node)
   - **Description**: Brief summary
3. Write your content in the page body

### Creating Links

Use the **Links To** property to connect nodes:
1. Add the slug of the target node as a multi-select option
2. Links appear as edges in the graph

### Internal Links in Content

To create clickable links to other nodes in your content:
1. In Notion, create a link with text `[[slug]]`
2. It will render as a styled internal link

Example: `[[my-project]]` becomes a clickable link to the "my-project" node.

### Cluster Colors

When you create the first node in a cluster, set its colors:
- **Color**: Main color for nodes (e.g., `#10b981`)
- **BgLight**: Top gradient color (e.g., `#d1fae5`)
- **BgDark**: Bottom gradient color (e.g., `#022c22`)

Subsequent nodes in that cluster will inherit these colors.

### Suggested Clusters

| Cluster | Purpose | Suggested Color |
|---------|---------|-----------------|
| Core | Central/home nodes | `#f59e0b` (amber) |
| LLM | AI/ML projects | `#10b981` (emerald) |
| Research | Academic work | `#6366f1` (indigo) |
| Creative | Art/personal | `#ec4899` (pink) |
| Meta | About/misc | `#64748b` (slate) |

## Project Structure

```
personal-graph-site/
├── api/
│   ├── notion.js          # Fetches database (nodes, links, clusters)
│   └── notion-page.js     # Fetches individual page content
├── src/
│   ├── main.js            # App initialization and graph logic
│   └── data.js            # API fetch functions
├── index.html             # Main page with styles
├── package.json
├── vercel.json            # Deployment config
└── vite.config.js
```

## Troubleshooting

### "Failed to load graph"
- Check that your Notion integration has access to the database
- Verify environment variables are set correctly
- Check browser console for specific error messages

### Nodes not appearing
- Ensure your database has the correct property names (case-sensitive)
- Check that nodes have a valid Group selected

### Links not showing
- Verify the slug in "Links To" matches an existing node's Slug exactly
- Slugs are case-sensitive

### Content not loading
- The integration needs access to read page content
- Check that the page isn't empty

## Security Notes

- Never commit your `.env.local` file
- The API key is only used server-side (in Vercel Functions)
- Client-side code never sees the API key

## License

MIT
