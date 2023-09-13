export interface Template {
  title: string;
  name: string;
  quantity: string;
};
const one: Template = {
    title: "$1000 - $3000",
    name: "one",
    quantity: "52",
}
const two: Template = {
    title: "$3000 - $5000",
    name: "two",
    quantity: "36",
}
const three: Template = {
    title: "$5000 - $10000",
    name: "three",
    quantity: "137",
}
const four: Template = {
    title: "$10000 - $15000",
    name: "four",
    quantity: "10",
}
const five: Template = {
    title: "$1500 - $20000",
    name: "five",
    quantity: "1",
}
export const byName = {
   one,
  two,
  three,
  four,
  five

};
export const salary = Object.values(byName);
