export interface Template {
  title: string;
  name: string;
  quantity: string;
};
const fullTime: Template = {
    title: "full time",
    name: "fullTime",
    quantity: "5",
}
const partTime: Template = {
    title: "part time",
    name: "fulltime",
    quantity: "6",
}
const remote: Template = {
    title: "remote",
    name: "remote",
    quantity: "120",
}
const internship: Template = {
    title: "internship",
    name: "internship",
    quantity: "10",
}
const contract: Template = {
    title: "contract",
    name: "contract",
    quantity: "1",
}
export const byName = {
    fullTime,
    partTime,
    remote,
    internship,
    contract
};
export const type = Object.values(byName);
