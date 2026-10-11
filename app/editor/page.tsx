import type { Metadata } from "next";
import { Editor } from "@/components/Editor";

export const metadata: Metadata = {
  title: "Level editor · Refract",
  description:
    "Build a Refract level, then have the solver prove it is solvable and measure its difficulty.",
};

export default function EditorPage() {
  return <Editor />;
}
