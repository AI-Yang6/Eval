import type { RubricDimension } from "@/lib/types";

export interface RubricTemplate {
  id: string;
  name: string;
  description: string;
  dimensions: RubricDimension[];
}

export const RUBRIC_TEMPLATES: RubricTemplate[] = [
  {
    id: "general",
    name: "通用评估",
    description: "适用于大多数场景，覆盖准确、完整、清晰、相关四个维度",
    dimensions: [
      { name: "准确性", description: "回复内容是否事实准确、无幻觉" },
      { name: "完整性", description: "是否完整覆盖了用户问题的所有方面" },
      { name: "清晰度", description: "回复是否条理清晰、易于理解" },
      { name: "相关性", description: "回复是否紧扣用户问题，无无关内容" },
    ],
  },
  {
    id: "customer-service",
    name: "客服场景",
    description: "客户服务、售后、咨询类场景",
    dimensions: [
      { name: "亲切度", description: "回复语气是否亲切友好" },
      { name: "专业度", description: "是否使用了准确的专业术语和政策" },
      { name: "解决力", description: "是否有效解决了用户问题或提供了可行方案" },
    ],
  },
  {
    id: "creative-writing",
    name: "创意写作",
    description: "营销文案、故事、剧本类生成任务",
    dimensions: [
      { name: "创意性", description: "内容是否新颖、有创意" },
      { name: "吸引力", description: "是否能吸引读者继续阅读" },
      { name: "风格匹配", description: "是否符合指定的写作风格" },
    ],
  },
];

export function getTemplate(id: string): RubricTemplate | undefined {
  return RUBRIC_TEMPLATES.find((t) => t.id === id);
}
