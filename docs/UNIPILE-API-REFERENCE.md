# Unipile API — Full Reference

Base URL: `https://api26.unipile.com:15608/api/v1`
Auth: `X-API-KEY` header

## Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/accounts` | List linked accounts |
| POST | `/accounts` | Connect account |
| GET | `/accounts/{id}` | Account details |
| DELETE | `/accounts/{id}` | Delete account |
| POST | `/accounts/{id}/reconnect` | Reconnect |
| GET | `/accounts/{id}/resync` | Resync messaging data |

## Users / LinkedIn Profiles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/profile` | Own profile |
| PATCH | `/users/profile` | Edit own profile |
| GET | `/users/{identifier}` | Get any profile (by provider_id or public_identifier) |
| GET | `/users/relations` | List all connections |
| GET | `/users/followers` | List followers |
| GET | `/users/following` | List following |
| GET | `/users/invitations-sent` | **List sent invitations (pending)** |
| GET | `/users/invitations-received` | List received invitations |
| POST | `/users/{identifier}/invite` | Send connection request |
| DELETE | `/users/invitations/{id}` | Cancel invitation |
| POST | `/users/{identifier}/invite` | Send invitation with message |
| GET | `/users/posts` | List own posts |
| GET | `/users/comments` | List own comments |
| GET | `/users/reactions` | List own reactions |

## Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/posts/{id}` | Get a post |
| POST | `/posts` | Create a post |
| GET | `/posts/{id}/comments` | **List comments on post** |
| POST | `/posts/{id}/comments` | Comment on post |
| GET | `/posts/{id}/reactions` | **List reactions on post** |
| POST | `/posts/{id}/reactions` | React to post |

### Post ID format
- Use the `social_id` from search results (URN format)
- URL-encode the URN: `urn%3Ali%3Aactivity%3A7437856238224347136`

### Comment structure
```json
{
  "object": "Comment",
  "id": "7437857807250444288",
  "post_id": "7437856238224347136",
  "date": "2026-03-12T13:51:29.965Z",
  "author": "Sourav Ratul",
  "author_details": {
    "id": "ACoAAAV0aHsBiUCDhf0eNF0d7w-ELzghbjI9Ho8",
    "is_company": false,
    "headline": "I Teach Copywriting...",
    "profile_url": "https://www.linkedin.com/in/souravratul",
    "network_distance": "DISTANCE_2",
    "profile_picture_url": "..."
  },
  "text": "comment text",
  "reaction_counter": 0,
  "reply_counter": 0
}
```

### Reaction structure
```json
{
  "object": "PostReaction",
  "value": "LIKE",
  "post_id": "urn:li:activity:...",
  "author": {
    "id": "ACoAAAP5cWsB3HB2...",
    "type": "INDIVIDUAL",
    "name": "Kirsten Krupps, MBA",
    "headline": "Senior Marketing Manager...",
    "profile_url": "...",
    "network_distance": "THIRD_DEGREE"
  }
}
```

## Chats / Messaging
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chats` | List all chats |
| POST | `/chats` | Start new chat |
| GET | `/chats/{id}` | Get a chat |
| GET | `/chats/{id}/messages` | List messages in chat |
| POST | `/chats/{id}/messages` | Send message |
| GET | `/chats/{id}/attendees` | Chat participants |
| DELETE | `/chats/{id}` | Delete chat |

## Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/messages` | List all messages |
| GET | `/messages/{id}` | Get a message |
| POST | `/messages/{id}/forward` | Forward message |
| GET | `/messages/{id}/attachment` | Get attachment |
| POST | `/messages/{id}/reactions` | React to message |

## LinkedIn Specific
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/linkedin/search` | **Search people, posts, companies, jobs** |
| GET | `/linkedin/search/parameters` | Get available search parameters |
| POST | `/linkedin/members/{id}/action` | Action on profile (follow, etc) |
| GET | `/linkedin/companies/{id}` | Company profile |
| POST | `/linkedin/raw-data` | Raw LinkedIn data |
| GET | `/linkedin/inmail/balance` | InMail credits |
| POST | `/linkedin/members/{id}/endorse` | Endorse skill |

### Search categories
- `people` — search for people
- `posts` — search for posts
- `companies` — search for companies
- `jobs` — search for jobs

### Search APIs
- `classic` — standard LinkedIn search
- `sales_navigator` — Sales Navigator (requires subscription)
- `recruiter` — Recruiter (requires subscription)

### Search body example (people)
```json
{
  "api": "classic",
  "category": "people",
  "keywords": "freelance marketing AI",
  "advanced_keywords": { "title": "Founder OR Freelancer" }
}
```

### Search body example (posts)
```json
{
  "api": "classic",
  "category": "posts",
  "keywords": "AI marketing automation",
  "sort_by": "date",
  "date_posted": "past-week"
}
```

### Search result — person
```json
{
  "type": "PEOPLE",
  "id": "ACoAABVCrR4B...",
  "name": "Name Surname",
  "public_identifier": "username",
  "headline": "Job Title | Company",
  "location": "Milan, Italy",
  "network_distance": "DISTANCE_2",
  "shared_connections_count": 5,
  "followers_count": 1200
}
```

### Search result — post
```json
{
  "type": "POST",
  "provider": "LINKEDIN",
  "social_id": "urn:li:activity:...",
  "id": "7438206989614108672",
  "date": "2h",
  "comment_counter": 36,
  "reaction_counter": 229,
  "text": "post text...",
  "author": {
    "public_identifier": "username",
    "id": "ACoAAC...",
    "name": "Author Name",
    "headline": "..."
  }
}
```

## Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Create webhook |
| DELETE | `/webhooks/{id}` | Delete webhook |

### Webhook events
- `new_relation` — connection accepted
- `message_received` — new message
- `new_chat` — new chat started

## Email
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mails` | List emails |
| POST | `/mails` | Send email |
| GET | `/mails/{id}` | Get email |
| DELETE | `/mails/{id}` | Delete email |

## Rate Limits (LinkedIn)
| Action | Limit |
|--------|-------|
| Connection requests | ~80-100 / week |
| Messages | ~100-150 / day |
| Search | Use with moderation |

## Error responses
```json
{
  "status": 422,
  "type": "errors/already_invited_recently",
  "title": "Should delay new invitation",
  "detail": "An invitation has already been sent recently..."
}
```

Common error types:
- `errors/already_invited_recently` — duplicate invite
- `errors/invalid_parameters` — bad request
- `errors/invalid_recipient` — invalid profile ID
- `errors/missing_credentials` — auth failure
