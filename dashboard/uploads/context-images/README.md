# Context Images Directory (Private)

This directory stores uploaded images from Discord conversations.

## Structure

```
context-images/
├── {guildId}/                 # One folder per server
│   ├── {channelId}_{userId}_{timestamp}_{random}.png
│   ├── {channelId}_{userId}_{timestamp}_{random}.jpg
│   └── ...
└── ...
```

## Security

- Images are NOT served directly by nginx
- They are served via authenticated API: `/api/guilds/{guildId}/images/{filename}`
- Only users with admin access to a guild can view that guild's images

## Backup

To backup a server's images, copy the entire `{guildId}/` folder.

## Deletion

To delete all images for a server, simply delete the `{guildId}/` folder.
The bot also provides methods to programmatically delete images.

## Cleanup

Old images (>30 days) can be cleaned up with the `cleanupOldImages()` function
in `src/ai/imageStorage.js`.
