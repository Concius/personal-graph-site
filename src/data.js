// API endpoint - works for both dev and production with Vercel
const API_BASE = '/api';

// Cache for graph data
let cachedData = null;

// Fallback data in case Notion fetch fails
const fallbackData = {
  nodes: [
    {
      id: 'home',
      name: 'Home',
      description: 'Welcome to my personal space. Unable to load from Notion.',
      group: 'core',
      weight: 8
    }
  ],
  links: [],
  clusters: {
    core: {
      name: 'Core',
      color: '#f59e0b',
      bgLight: '#fef3c7',
      bgDark: '#1c1917'
    }
  }
};

export async function fetchGraphData() {
  if (cachedData) return cachedData;
  
  try {
    const response = await fetch(`${API_BASE}/notion`);
    
    if (!response.ok) {
      console.error('Notion API response not OK:', response.status);
      throw new Error('Failed to fetch graph data');
    }
    
    const data = await response.json();
    
    // Validate that we got actual data
    if (!data.nodes || data.nodes.length === 0) {
      console.warn('No nodes returned from Notion, using fallback');
      return fallbackData;
    }
    
    cachedData = data;
    return cachedData;
    
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return fallbackData;
  }
}

export async function fetchNodeContent(pageId) {
  try {
    const response = await fetch(`${API_BASE}/notion-page?pageId=${pageId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch page content');
    }
    
    const data = await response.json();
    return data.html || '<p>No content available.</p>';
    
  } catch (error) {
    console.error('Error fetching node content:', error);
    return '<p>Failed to load content. Please try again later.</p>';
  }
}
