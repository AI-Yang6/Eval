import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

import { SpotlightCard } from "@/components/ui/spotlight-card";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-10 bg-bg-base text-text-primary">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回应用
        </Link>

        <SpotlightCard className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                隐私与数据说明
              </h1>
              <p className="text-sm text-text-tertiary mt-1">
                AI Evaluation Studio 是本地优先的评估工具。
              </p>
            </div>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-text-secondary">
            <section>
              <h2 className="text-base font-semibold text-text-primary mb-2">
                数据存储
              </h2>
              <p>
                测试集、Prompt、模型配置、评估结果、知识库和备份数据默认保存在你的浏览器 IndexedDB 中。清除浏览器数据、使用无痕模式或更换设备可能导致数据丢失。
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-text-primary mb-2">
                API Key
              </h2>
              <p>
                API Key 随模型配置保存在你的浏览器本地数据中。调用模型时，API Key 会通过本站的 API route 转发给你选择的模型 Provider。本站不会主动要求你提交平台账号密码，也不应在不可信设备上保存个人 API Key。
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-text-primary mb-2">
                第三方模型服务
              </h2>
              <p>
                当你运行评估、测试连接或生成 Embedding 时，你输入的 Prompt、测试用例、知识库片段和 API Key 会发送到对应的第三方模型服务。请不要上传你无权处理的敏感数据。
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-text-primary mb-2">
                备份
              </h2>
              <p>
                备份文件会包含本地工作台数据，可能包括模型配置和 API Key。请妥善保存备份文件，不要公开分享。
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-text-primary mb-2">
                当前版本边界
              </h2>
              <p>
                当前版本适合个人使用、作品集展示和可信用户内测。公开使用时建议配合访问保护、备份习惯和自持 API Key 策略。
              </p>
            </section>
          </div>
        </SpotlightCard>
      </div>
    </main>
  );
}
