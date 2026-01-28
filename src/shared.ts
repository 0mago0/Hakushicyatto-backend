export type SvgAttachment = {
  id: string;
  url: string;
  filename: string;
};

export type ChatMessage = {
  id: string;
  content: string;
  user: string;
  role: "user" | "assistant";
  timestamp?: number;
  svgs?: SvgAttachment[];
};

export type Message =
  | {
      type: "add";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      timestamp?: number;
      svgs?: SvgAttachment[];
    }
  | {
      type: "update";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      timestamp?: number;
      svgs?: SvgAttachment[];
    }
  | {
      type: "all";
      messages: ChatMessage[];
    };
