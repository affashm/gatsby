const _ = require(`lodash`)
const slugify = require(`slugify`)
const moment = require(`moment`)
const url = require(`url`)
const { getMdxContentSlug } = require(`../get-mdx-content-slug`)
const { getTemplate } = require(`../get-template`)

exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions
  if (node.internal.type === `AuthorYaml`) {
    createNodeField({
      node,
      name: `slug`,
      value: `/contributors/${slugify(node.id, { lower: true })}/`,
    })
  } else {
    const slug = getMdxContentSlug(node, getNode(node.parent))
    if (!slug) return
    const section = slug.split(`/`)[1]
    if (section !== `blog`) return

    createNodeField({ node, name: `slug`, value: slug })
    createNodeField({ node, name: `section`, value: section })

    const { date, draft, canonicalLink, publishedAt, excerpt } =
      node.frontmatter || {}

    createNodeField({
      node,
      name: `released`,
      value: !draft && !!date && moment.utc().isSameOrAfter(moment.utc(date)),
    })

    createNodeField({
      node,
      name: `publishedAt`,
      value: canonicalLink
        ? publishedAt || url.parse(canonicalLink).hostname
        : null,
    })

    // If an excerpt is defined, use it, otherwise default to autogenerated excerpt
    createNodeField({
      node,
      name: `excerpt`,
      value: excerpt || node.excerpt,
    })
  }
}

exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions

  const blogPostTemplate = getTemplate(`template-blog-post`)
  const blogListTemplate = getTemplate(`template-blog-list`)
  const tagTemplate = getTemplate(`tags`)
  const contributorPageTemplate = getTemplate(`template-contributor-page`)

  const { data, errors } = await graphql(`
    query {
      allAuthorYaml {
        nodes {
          id
          fields {
            slug
          }
        }
      }
      allMdx(
        sort: { order: DESC, fields: [frontmatter___date, fields___slug] }
        limit: 10000
        filter: {
          fileAbsolutePath: { ne: null }
          frontmatter: { draft: { ne: true } }
          fields: { section: { eq: "blog" } }
        }
      ) {
        nodes {
          fields {
            slug
            released
          }
          frontmatter {
            title
            canonicalLink
            publishedAt
            tags
          }
        }
      }
    }
  `)
  if (errors) throw errors

  // Create contributor pages.
  data.allAuthorYaml.nodes.forEach((node) => {
    createPage({
      path: `${node.fields.slug}`,
      component: contributorPageTemplate,
      context: {
        authorId: node.id,
      },
    })
  })

  const blogPosts = data.allMdx.nodes

  const releasedBlogPosts = blogPosts.filter((post) =>
    _.get(post, `fields.released`),
  )

  // Create blog-list pages.
  const postsPerPage = 8
  const numPages = Math.ceil(releasedBlogPosts.length / postsPerPage)

  Array.from({
    length: numPages,
  }).forEach((_, i) => {
    createPage({
      path: i === 0 ? `/blog` : `/blog/page/${i + 1}`,
      component: blogListTemplate,
      context: {
        limit: postsPerPage,
        skip: i * postsPerPage,
        numPages,
        currentPage: i + 1,
      },
    })
  })

  // Create blog-post pages.
  blogPosts.forEach((node, index) => {
    let next = index === 0 ? null : blogPosts[index - 1]
    if (next && !_.get(next, `fields.released`)) next = null

    const prev = index === blogPosts.length - 1 ? null : blogPosts[index + 1]

    createPage({
      path: `${node.fields.slug}`, // required
      component: blogPostTemplate,
      context: {
        slug: node.fields.slug,
        prev: prev && {
          title: prev.frontmatter.title,
          link: prev.fields.slug,
        },
        next: next && {
          title: next.frontmatter.title,
          link: next.fields.slug,
        },
      },
    })
  })

  const makeSlugTag = (tag) => _.kebabCase(tag.toLowerCase())

  // Collect all tags and group them by their kebab-case so that
  // hyphenated and spaced tags are treated the same. e.g
  // `case-study` -> [`case-study`, `case study`]. The hyphenated
  // version will be used for the slug, and the spaced version
  // will be used for human readability (see templates/tags)
  const tagGroups = _(releasedBlogPosts)
    .map((post) => _.get(post, `frontmatter.tags`))
    .filter()
    .flatten()
    .uniq()
    .groupBy(makeSlugTag)

  tagGroups.forEach((tags, tagSlug) => {
    createPage({
      path: `/blog/tags/${tagSlug}/`,
      component: tagTemplate,
      context: {
        tags,
      },
    })
  })
}
