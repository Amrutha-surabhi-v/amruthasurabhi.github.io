const { Client } = require('@notionhq/client');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function fetchPosts() {
  console.log('Connecting to Notion...');
  
  const db = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }]
  });

  console.log('Found ' + db.results.length + ' rows in database');

  const posts = await Promise.all(db.results.map(async (page) => {
    const blocks = await notion.blocks.children.list({ block_id: page.id });

    const content = blocks.results.map(b => {
      const type = b.type;
      const getText = (arr) => (arr || []).map(t => {
        let s = t.plain_text;
        if (t.annotations.bold) s = '<strong>' + s + '</strong>';
        if (t.annotations.italic) s = '<em>' + s + '</em>';
        if (t.annotations.code) s = '<code>' + s + '</code>';
        return s;
      }).join('');

      if (type === 'paragraph') return '<p>' + getText(b.paragraph.rich_text) + '</p>';
      if (type === 'heading_1') return '<h1>' + getText(b.heading_1.rich_text) + '</h1>';
      if (type === 'heading_2') return '<h2>' + getText(b.heading_2.rich_text) + '</h2>';
      if (type === 'heading_3') return '<h3>' + getText(b.heading_3.rich_text) + '</h3>';
      if (type === 'bulleted_list_item') return '<li>' + getText(b.bulleted_list_item.rich_text) + '</li>';
      if (type === 'numbered_list_item') return '<li>' + getText(b.numbered_list_item.rich_text) + '</li>';
      if (type === 'quote') return '<blockquote>' + getText(b.quote.rich_text) + '</blockquote>';
      if (type === 'image') {
        const url = b.image.type === 'external' ? b.image.external.url : b.image.file.url;
        return '<img src="' + url + '" alt="" />';
      }
      if (type === 'divider') return '<hr/>';
      return '';
    }).join('');

    const props = page.properties;
    const titleProp = props.title || props.Title || props.Name;
    const dateProp = props.date || props.Date;
    const tagsProp = props.tags || props.Tags;

    return {
      id: page.id,
      title: titleProp?.title?.[0]?.plain_text || 'Untitled',
      date: dateProp?.date?.start || '',
      tags: tagsProp?.multi_select?.map(t => t.name) || [],
      cover: page.cover?.external?.url || page.cover?.file?.url || '',
      content
    };
  }));

  fs.mkdirSync('posts', { recursive: true });
  fs.writeFileSync('posts/index.json', JSON.stringify(posts, null, 2));
  console.log('Done! Saved ' + posts.length + ' posts to posts/index.json');
}

fetchPosts().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
