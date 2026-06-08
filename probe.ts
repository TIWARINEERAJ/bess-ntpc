import { jsPDF } from "jspdf";
import { writeFileSync } from "fs";
const d = new jsPDF();
d.text("hello", 20, 20);
const buf = Buffer.from(d.output("arraybuffer"));
writeFileSync("/dev-server/probe.pdf", buf);
console.log("bytes", buf.length);
