export interface Template {
  title: string;
  name: string;
  quantity: string;
};
const motionGraphics: Template = {
    title: "motion graphics",
    name: "motionGraphics",
    quantity: "52",
}
const design: Template = {
    title: "design",
    name: "design",
    quantity: "36",
}
const sales: Template = {
    title: "sales",
    name: "sales",
    quantity: "137",
}
const marketing: Template = {
    title: "marketing",
    name: "marketing",
    quantity: "10",
}
const finance: Template = {
    title: "finacne",
    name: "finacne",
    quantity: "1",
}
export const byName = {
    motionGraphics,
    design,
    sales,
    marketing,
    finance

};
export const categories = Object.values(byName);
