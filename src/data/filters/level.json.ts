export interface Template {
  title: string;
  name: string;
  quantity: string;
};
const junior: Template = {
    title: "junior",
    name: "junior",
    quantity: "152",
}
const mid: Template = {
    title: "mid",
    name: "mid",
    quantity: "40",
}
const senior: Template = {
    title: "senior",
    name: "senior",
    quantity: "468",
}
const director: Template = {
    title: "director",
    name: "director",
    quantity: "209",
}
const other: Template = {
    title: "other",
    name: "other",
    quantity: "9",
}
export const byName = {
    junior,
    mid,
    senior,
    director,
    other

};
export const level = Object.values(byName);
