export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { pageId } = req.query;
  
  if (!pageId) {
    return res.status(400).json({ error: 'pageId required' });
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;

  if (!NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY environment variable');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Fetch page blocks (content)
    const blocksResponse = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28'
        }
      }
    );

    const blocksData = await blocksResponse.json();
    
    if (!blocksResponse.ok) {
      console.error('Notion blocks error:', blocksData);
      throw new Error(blocksData.message || 'Failed to fetch page');
    }

    // Convert Notion blocks to HTML
    const html = blocksToHtml(blocksData.results);

    return res.status(200).json({ html });

  } catch (error) {
    console.error('Notion page error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function blocksToHtml(blocks) {
  let html = '';
  let inList = false;
  let listType = null;
  
  blocks.forEach((block, index) => {
    const type = block.type;
    const content = block[type];
    
    // Handle list grouping
    const isListItem = type === 'bulleted_list_item' || type === 'numbered_list_item';
    const nextBlock = blocks[index + 1];
    const nextIsListItem = nextBlock && (
      nextBlock.type === 'bulleted_list_item' || 
      nextBlock.type === 'numbered_list_item'
    );
    
    // Start list if needed
    if (isListItem && !inList) {
      inList = true;
      listType = type === 'bulleted_list_item' ? 'ul' : 'ol';
      html += `<${listType}>`;
    }
    
    // Add block content
    switch (type) {
      case 'paragraph':
        const pText = richTextToHtml(content.rich_text);
        if (pText) html += `<p>${pText}</p>`;
        break;
      
      case 'heading_1':
        html += `<h2>${richTextToHtml(content.rich_text)}</h2>`;
        break;
      
      case 'heading_2':
        html += `<h3>${richTextToHtml(content.rich_text)}</h3>`;
        break;
      
      case 'heading_3':
        html += `<h4>${richTextToHtml(content.rich_text)}</h4>`;
        break;
      
      case 'bulleted_list_item':
      case 'numbered_list_item':
        html += `<li>${richTextToHtml(content.rich_text)}</li>`;
        break;
      
      case 'code':
        const lang = content.language || 'plaintext';
        const codeText = richTextToHtml(content.rich_text, true);
        html += `<pre><code class="language-${lang}">${codeText}</code></pre>`;
        break;
      
      case 'quote':
        html += `<blockquote>${richTextToHtml(content.rich_text)}</blockquote>`;
        break;
      
      case 'callout':
        const emoji = content.icon?.emoji || '💡';
        html += `<div class="callout"><span class="callout-icon">${emoji}</span><div class="callout-content">${richTextToHtml(content.rich_text)}</div></div>`;
        break;
      
      case 'divider':
        html += '<hr>';
        break;
      
      case 'image':
        const imgUrl = content.file?.url || content.external?.url || '';
        const caption = content.caption?.length ? richTextToHtml(content.caption) : '';
        if (imgUrl) {
          html += `<figure><img src="${imgUrl}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
        }
        break;
      
      case 'video':
        const videoUrl = content.file?.url || content.external?.url || '';
        if (videoUrl) {
          html += `<video controls src="${videoUrl}"></video>`;
        }
        break;
      
      case 'bookmark':
        const bookmarkUrl = content.url || '';
        const bookmarkCaption = content.caption?.length ? richTextToHtml(content.caption) : bookmarkUrl;
        html += `<a href="${bookmarkUrl}" target="_blank" class="bookmark">${bookmarkCaption}</a>`;
        break;
      
      case 'toggle':
        const toggleTitle = richTextToHtml(content.rich_text);
        html += `<details><summary>${toggleTitle}</summary></details>`;
        break;
      
      default:
        // Silently skip unsupported block types
        break;
    }
    
    // End list if needed
    if (inList && (!nextIsListItem || (nextBlock && nextBlock.type !== type))) {
      html += `</${listType}>`;
      inList = false;
      listType = null;
    }
  });
  
  // Close any open list
  if (inList) {
    html += `</${listType}>`;
  }
  
  return html;
}

function richTextToHtml(richTextArray, preserveWhitespace = false) {
  if (!richTextArray || !richTextArray.length) return '';
  
  return richTextArray.map(rt => {
    let text = rt.plain_text || '';
    
    // Escape HTML entities
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Handle annotations (formatting)
    if (rt.annotations) {
      if (rt.annotations.code) text = `<code>${text}</code>`;
      if (rt.annotations.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations.italic) text = `<em>${text}</em>`;
      if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
      if (rt.annotations.underline) text = `<u>${text}</u>`;
      
      const color = rt.annotations.color;
      if (color && color !== 'default') {
        const colorMap = {
          'gray': '#9ca3af',
          'brown': '#a8a29e',
          'orange': '#fb923c',
          'yellow': '#fbbf24',
          'green': '#4ade80',
          'blue': '#60a5fa',
          'purple': '#a78bfa',
          'pink': '#f472b6',
          'red': '#f87171',
          'gray_background': 'rgba(156, 163, 175, 0.2)',
          'brown_background': 'rgba(168, 162, 158, 0.2)',
          'orange_background': 'rgba(251, 146, 60, 0.2)',
          'yellow_background': 'rgba(251, 191, 36, 0.2)',
          'green_background': 'rgba(74, 222, 128, 0.2)',
          'blue_background': 'rgba(96, 165, 250, 0.2)',
          'purple_background': 'rgba(167, 139, 250, 0.2)',
          'pink_background': 'rgba(244, 114, 182, 0.2)',
          'red_background': 'rgba(248, 113, 113, 0.2)'
        };
        
        const cssColor = colorMap[color];
        if (cssColor) {
          if (color.includes('background')) {
            text = `<span style="background-color: ${cssColor}; padding: 0 4px; border-radius: 3px;">${text}</span>`;
          } else {
            text = `<span style="color: ${cssColor}">${text}</span>`;
          }
        }
      }
    }
    
    // Handle external links
    if (rt.href) {
      text = `<a href="${rt.href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    
    // Convert [[slug]] patterns to clickable wiki-links (works on plain text)
    text = text.replace(/\[\[([^\]]+)\]\]/g, (match, slug) => {
      const normalizedSlug = slug.trim().toLowerCase();
      return `<a href="#" class="node-link" data-node="${normalizedSlug}">${slug.trim()}</a>`;
    });
    
    return text;
  }).join('');
}
