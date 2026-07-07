export const iconSizes = {
  xs: "size-3",
  sm: "size-4",
  base: "size-5",
  md: "size-6",
  lg: "size-7",
  xl: "size-8",
} as const;

export type IconSize = keyof typeof iconSizes;
