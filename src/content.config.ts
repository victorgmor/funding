import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const legal = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/legal" }),
  schema: z.object({
    page: z.string(),
    pubDate: z.date(),
  }),
});

const jobs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/jobs" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      type: z.string(),
      jobLevel: z.string().optional(),
      jobType: z.string().optional(),
      updated: z.string().optional(),
      category: z.string(),
      tags: z.array(z.string()),
      salary: z.string().optional(),
      experienceLevel: z.string().optional(),
      datePosted: z.date(),
      applyUrl: z.string(),
      deadline: z.date().optional(),
      flag: z
        .object({
          url: image(),
          alt: z.string(),
        })
        .optional(),
      isFeatured: z.boolean().optional(),
      isClosed: z.boolean().optional(),
    }),
});

const companies = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/companies" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      founded: z.string().optional(),
      headquarters: z.string().optional(),
      website: z.string(),
      hiringPage: z.string().optional(),
      description: z.string(),
      logo: image().optional(),
      location: z.string().optional(),
      size: z.string().optional(),
      industry: z.string().optional(),
      benefits: z.array(z.string()).optional(),
      companyType: z.string().optional(),
      remotePolicy: z.string().optional(),
      culture: z.string().optional(),
      mission: z.string().optional(),
      about: z.string().optional(),
      values: z.array(z.string()).optional(),
      milestones: z.array(z.string()).optional(),
      socials: z
        .object({
          twitter: z.string().optional(),
          linkedin: z.string().optional(),
          github: z.string().optional(),
        })
        .optional(),
    }),
});

const candidates = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/candidates" }),
  schema: ({ image }) =>
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.email(),
      phone: z.string().optional(),
      resumeUrl: z.string().optional(),
      coverLetter: z.string().optional(),
      location: z.string().optional(),
      experienceLevel: z.string().optional(),
      jobPreferences: z.array(z.string()).optional(),
      dateApplied: z.string(),
      linkedinProfile: z.string().optional(),
      githubProfile: z.string().optional(),
      portfolioUrl: z.string().optional(),
      status: z.string().optional(),
      avatar: z
        .object({
          url: image(),
          alt: z.string(),
        })
        .optional(),
      isFeatured: z.boolean().optional(),
    }),
});

const team = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/team" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string().optional(),
      bio: z.string().optional(),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
      socials: z
        .object({
          twitter: z.string().optional(),
          website: z.string().optional(),
          linkedin: z.string().optional(),
          email: z.string().optional(),
        })
        .optional(),
    }),
});

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.date(),
      description: z.string(),
      team: z.string(),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
      tags: z.array(z.string()),
    }),
});

const helpcenter = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/helpcenter" }),
  schema: z.object({
    iconId: z.string().optional(),
    page: z.string(),
    description: z.string(),
    category: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    lastUpdated: z.string().optional(),
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .optional(),
  }),
});

export const collections = {
  legal,
  jobs,
  companies,
  candidates,
  team,
  posts,
  helpcenter,
};
