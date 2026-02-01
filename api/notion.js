export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const DATABASE_ID = process.env.NOTION_DATABASE_ID;

  if (!NOTION_API_KEY || !DATABASE_ID) {
    console.error('Missing environment variables');
    return res.status(500).json({ 
      error: 'Server configuration error. Please check environment variables.' 
    });
  }

  try {
    // Fetch database entries
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    const dbData = await dbResponse.json();
    
    if (!dbResponse.ok) {
      console.error('Notion API error:', dbData);
      throw new Error(dbData.message || 'Failed to fetch from Notion');
    }

    // Build nodes and collect slugs for link validation
    const nodes = [];
    const clusters = {};
    const validSlugs = new Set();

    for (const page of dbData.results) {
      const props = page.properties;
      
      const slug = props.Slug?.rich_text?.[0]?.plain_text || page.id;
      const name = props.Name?.title?.[0]?.plain_text || 'Untitled';
      const group = (props.Group?.select?.name || 'meta').toLowerCase();
      const weight = props.Weight?.number || 3;
      const description = props.Description?.rich_text?.[0]?.plain_text || '';
      const color = props.Color?.rich_text?.[0]?.plain_text || '#6366f1';
      const bgLight = props.BgLight?.rich_text?.[0]?.plain_text || '#e0e7ff';
      const bgDark = props.BgDark?.rich_text?.[0]?.plain_text || '#1e1b4b';

      nodes.push({
        id: slug,
        pageId: page.id,
        name,
        group,
        weight,
        description
      });

      validSlugs.add(slug);

      if (!clusters[group]) {
        clusters[group] = {
          name: group.charAt(0).toUpperCase() + group.slice(1),
          color,
          bgLight,
          bgDark
        };
      }
    }

    // Fetch content for all pages and extract wiki links automatically
    const links = [];
    const linkSet = new Set();

    await Promise.all(nodes.map(async (node) => {
      try {
        const blocksResponse = await fetch(
          `https://api.notion.com/v1/blocks/${node.pageId}/children?page_size=100`,
          {
            headers: {
              'Authorization': `Bearer ${NOTION_API_KEY}`,
              'Notion-Version': '2022-06-28'
            }
          }
        );

        if (!blocksResponse.ok) return;

        const blocksData = await blocksResponse.json();
        const wikiLinks = extractWikiLinks(blocksData.results);

        // Create links for valid targets
        wikiLinks.forEach(targetSlug => {
          if (validSlugs.has(targetSlug) && targetSlug !== node.id) {
            const linkKey = [node.id, targetSlug].sort().join('::');
            
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
              links.push({
                source: node.id,
                target: targetSlug
              });
            }
          }
        });

      } catch (err) {
        console.error(`Failed to fetch content for ${node.id}:`, err);
      }
    }));

    // Ensure core cluster exists
    if (!clusters.core) {
      clusters.core = {
        name: 'Core',
        color: '#f59e0b',
        bgLight: '#fef3c7',
        bgDark: '#1c1917'
      };
    }

    return res.status(200).json({ nodes, links, clusters });

  } catch (error) {
    console.error('Notion API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Extract all [[slug]] wiki links from Notion blocks
 */
function extractWikiLinks(blocks) {
  const wikiLinks = new Set();
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;

  function extractFromRichText(richTextArray) {
    if (!richTextArray) return;
    
    for (const rt of richTextArray) {
      const text = rt.plain_text || '';
      let match;
      while ((match = wikiLinkRegex.exec(text)) !== null) {
        wikiLinks.add(match[1].trim().toLowerCase());
      }
    }
  }

  for (const block of blocks) {
    const type = block.type;
    const content = block[type];

    if (!content) continue;

    if (content.rich_text) {
      extractFromRichText(content.rich_text);
    }

    if (content.caption) {
      extractFromRichText(content.caption);
    }
  }

  return Array.from(wikiLinks);
}
