// The old app's documents, fragment for fragment (src/components/*, src/data/*, pages/*).
export const newsTitleFragment = `
  fragment NewsTitle on NewsItem {
    id
    title
    url
    upvoted
  }
`;

export const newsDetailNewsItemFragment = `
  fragment NewsDetail on NewsItem {
    id
    commentCount
    creationTime
    hidden
    submitterId
    upvoteCount
  }
`;

export const newsFeedNewsItemFragment = `
  fragment NewsFeed on NewsItem {
    id
    hidden
    ...NewsTitle
    ...NewsDetail
  }
  ${newsTitleFragment}
  ${newsDetailNewsItemFragment}
`;

export const commentFragment = `
  fragment Comment on Comment {
    id
    creationTime
    comments {
      id
      creationTime
      submitterId
      text
    }
    submitterId
    text
  }
`;

export const commentsFragment = `
  fragment Comments on Comment {
    id
    comments {
      id
      comments {
        id
        comments {
          id
          comments {
            id
            ...Comment
          }
          ...Comment
        }
        ...Comment
      }
      ...Comment
    }
    ...Comment
  }
  ${commentFragment}
`;

// Each old feed page names its own operation (topNewsItems, NewestFeed, bestNewsItems) over one document.
export const feedQuery = (operation: string) => `
  query ${operation}($type: FeedType!, $first: Int!, $skip: Int!) {
    feed(type: $type, first: $first, skip: $skip) {
      ...NewsFeed
    }
  }
  ${newsFeedNewsItemFragment}
`;

export const ME_QUERY = `
  query User {
    me {
      id
      karma
    }
  }
`;

export const NEWS_ITEM_WITH_COMMENTS_QUERY = `
  query NewsItemWithComments($id: Int!) {
    newsItem(id: $id) {
      id
      comments {
        ...Comments
      }
      ...NewsTitle
      ...NewsDetail
    }
  }
  ${newsTitleFragment}
  ${newsDetailNewsItemFragment}
  ${commentsFragment}
`;

export const USER_QUERY = `
  query User($id: String!) {
    user(id: $id) {
      id
      about
      creationTime
      email
      karma
    }
    me {
      id
    }
  }
`;

export const COMMENT_QUERY = `
  query Comment($id: Int!) {
    comment(id: $id) {
      id
      ...Comment
    }
  }
  ${commentFragment}
`;

export const UPVOTE_NEWS_ITEM_MUTATION = `
  mutation UpvoteNewsItem($id: Int!) {
    upvoteNewsItem(id: $id) {
      id
      upvoteCount
      upvoted
    }
  }
`;

export const HIDE_NEWS_ITEM_MUTATION = `
  mutation HideNewsItem($id: Int!) {
    hideNewsItem(id: $id) {
      id
      hidden
    }
  }
`;

export const SUBMIT_NEWS_ITEM_MUTATION = `
  mutation SubmitNewsItem($title: String!, $url: String) {
    submitNewsItem(title: $title, url: $url) {
      id
      ...NewsFeed
    }
  }
  ${newsFeedNewsItemFragment}
`;
