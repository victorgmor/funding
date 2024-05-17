import { defineCollection, z } from "astro:content";
const companies = defineCollection({
  schema: z.object({
    link: z.string(),
    page: z.string(),
    about: z.string(),
    type: z.string(),
    salary: z.string(),
    company: z.string(),
    position: z.string(),
    employees: z.string(),
    location: z.string(),
    companyLogo: z.object({
      url: z.string(),
      alt: z.string(),
    }),
  }),
});
const openjobs = defineCollection({
  schema: z.object({
    page: z.string(),
    company: z.string(),
    position: z.string(),
    location: z.string(),
    department: z.string(),
    level: z.string(),
    type: z.string(),
    salary: z.string(),
    pubDate: z.date(),
    companyLogo: z.object({
      url: z.string(),
      alt: z.string(),
    }),
  }),
});
const infopages = defineCollection({
  schema: z.object({
    page: z.string(),
    pubDate: z.date(),
    description: z.string(),
  }),
});
const postsCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    author: z.string(),
    image: z.object({
      url: z.string(),
      alt: z.string(),
    }),
    tags: z.array(z.string()),
  }),
});
export const collections = {
  posts: postsCollection,
  infopages: infopages,
  openjobs: openjobs,
  companies: companies,
};
