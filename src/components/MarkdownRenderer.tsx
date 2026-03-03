import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from 'react';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';

interface MarkdownRendererProps {
    content: string;
    isDark?: boolean;
}

function CodeBlock({
    language,
    children,
    isDark,
}: {
    language: string;
    children: string;
    isDark: boolean;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(children).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="code-block-wrapper">
            <div className="code-block-header">
                <span className="code-lang">{language || 'text'}</span>
                <Tooltip title={copied ? '已复制！' : '复制代码'}>
                    <Button
                        type="text"
                        size="small"
                        icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                        onClick={handleCopy}
                        className="copy-btn"
                    />
                </Tooltip>
            </div>
            <SyntaxHighlighter
                style={isDark ? oneDark : oneLight}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 8px 8px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    );
}

export const MarkdownRenderer = ({ content, isDark = false }: MarkdownRendererProps) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath] as any[]}
            rehypePlugins={[rehypeKatex, rehypeRaw] as any[]}
            className="md-content"
            components={{
                code(props: any) {
                    const { children, className, node, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || '');
                    const isBlock = node?.position?.start?.line !== node?.position?.end?.line
                        || String(children).includes('\n');

                    if (match || isBlock) {
                        return (
                            <CodeBlock language={match?.[1] || ''} isDark={isDark}>
                                {String(children).replace(/\n$/, '')}
                            </CodeBlock>
                        );
                    }
                    return (
                        <code {...rest} className="inline-code">
                            {children}
                        </code>
                    );
                },
                table({ children }) {
                    return (
                        <div className="table-wrapper">
                            <table>{children}</table>
                        </div>
                    );
                },
                a({ children, href }) {
                    return (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                        </a>
                    );
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
};
