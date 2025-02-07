import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, MarkdownRenderer } from 'obsidian';

// 定义视图类型常量
const VIEW_TYPE_WEREAD = "weread-formatter";

// 在文件顶部添加 Modal 类
class ConfirmationModal extends Modal {
    private result: boolean = false;
    
    constructor(
        app: App,
        private fileName: string,
        private onConfirm: () => void
    ) {
        super(app);
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        contentEl.createEl('h2', {text: '确认格式化'});
        contentEl.createEl('p', {
            text: `是否要格式化文档 "${this.fileName}"？`
        });

        // 添加按钮容器
        const buttonContainer = contentEl.createDiv('modal-button-container');
        
        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', {
            text: '取消'
        });
        cancelButton.addEventListener('click', () => {
            this.close();
        });

        // 确认按钮
        const confirmButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: '确认格式化'
        });
        confirmButton.addEventListener('click', () => {
            this.result = true;
            this.close();
            this.onConfirm();
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// 添加 AI 服务类
class AIService {
    constructor(
        private apiUrl: string,
        private apiKey: string,
        private modelName: string,
        private promptTemplate: string
    ) {}

    async askAI(quote: string, thought: string, bookName: string): Promise<string> {
        try {
            const prompt = `正在阅读：${bookName}\n\n原文：${quote}\n\n读者想法：${thought}\n\n${this.promptTemplate}`;
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: [{
                        role: "user",
                        content: prompt
                    }]
                })
            });

            if (!response.ok) {
                throw new Error('API 请求失败');
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('AI 服务错误:', error);
            throw error;
        }
    }
}

// 添加 AI 响应对话框
class AIResponseModal extends Modal {
    constructor(
        app: App,
        private quote: string,
        private thought: string,
        private aiService: AIService,
        private bookName: string
    ) {
        super(app);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-response-modal');

        // 添加加载动画
        const loadingEl = contentEl.createDiv('loading-container');
        const loadingSpinner = loadingEl.createDiv('loading-spinner');
        const loadingText = loadingEl.createDiv('loading-text');
        loadingText.setText('🐌小蜗 正在阅读...');
        
        try {
            const response = await this.aiService.askAI(this.quote, this.thought, this.bookName);
            loadingEl.remove();

            // 创建响应容器
            const responseContainer = contentEl.createDiv('response-container');

            // 添加原文区域
            const quoteSection = responseContainer.createDiv('quote-section');
            const quoteTitle = quoteSection.createEl('h3');
            quoteTitle.setText('原文');
            quoteTitle.addClass('section-title');
            const quoteContent = quoteSection.createDiv('quote-content');
            quoteContent.setText(this.quote.replace('🐌', '').trim());

            // 添加读者想法区域
            if (this.thought) {
                const thoughtSection = responseContainer.createDiv('thought-section');
                const thoughtTitle = thoughtSection.createEl('h3');
                thoughtTitle.setText('读者想法');
                thoughtTitle.addClass('section-title');
                const thoughtContent = thoughtSection.createDiv('thought-content');
                thoughtContent.setText(this.thought);
            }

            // 添加AI回应区域
            const aiSection = responseContainer.createDiv('ai-section');
            const titleContainer = aiSection.createDiv('title-container');
            const aiTitle = titleContainer.createEl('h3');
            aiTitle.setText('小蜗思考');
            aiTitle.addClass('section-title');
            
            // 添加复制按钮
            const copyButton = titleContainer.createEl('button', {
                cls: 'copy-button'
            });
            copyButton.setText('复制');
            copyButton.addEventListener('click', async () => {
                await navigator.clipboard.writeText(response);
                const originalText = copyButton.getText();
                copyButton.setText('已复制!');
                setTimeout(() => copyButton.setText(originalText), 2000);
            });
            
            const aiContent = aiSection.createDiv('ai-content');
            aiContent.setText(response);

        } catch (error) {
            loadingEl.remove();
            const errorMessage = contentEl.createEl('p');
            errorMessage.setText('获取 AI 响应时出错：' + error.message);
            errorMessage.addClass('error-message');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 在文件顶部添加接口定义
interface WeReadFormatterSettings {
    apiUrl: string;
    apiKey: string;
    modelName: string;
    promptTemplate: string;
}

const DEFAULT_SETTINGS: WeReadFormatterSettings = {
    apiUrl: '',
    apiKey: '',
    modelName: '',
    promptTemplate: '你是一名资深读者，请你基于我的上述读书笔记谈谈你的思考。可以是金句、脑洞、或对我观点的质疑，50～100字左右，不要轻易认同我，你的见解一定要明确、专业、独到、发人深省，不要使用Markdown格式优化.'
};

// 添加设置标签页
class WeReadFormatterSettingTab extends PluginSettingTab {
    plugin: WeReadFormatter;

    constructor(app: App, plugin: WeReadFormatter) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: '微信读书格式化设置'});
        
        // 添加API配置提示
        const noticeEl = containerEl.createEl('div', {
            cls: 'setting-notice',
        });
        
        const warningIconEl = noticeEl.createEl('span', {
            text: '⚠️ ',
        });
        
        noticeEl.createEl('p', {
            text: '请先配置AI服务API信息，否则无法使用AI思考功能。配置完成后，在预览模式下将鼠标悬停在引用块上即可看到AI按钮。',
        });

        new Setting(containerEl)
            .setName('API URL')
            .setDesc('AI 服务的 API 地址')
            .addText(text => text
                .setPlaceholder('输入 API URL')
                .setValue(this.plugin.settings.apiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('AI 服务的 API 密钥')
            .addText(text => text
                .setPlaceholder('输入 API Key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('模型名称')
            .setDesc('使用的 AI 模型名称')
            .addText(text => text
                .setPlaceholder('输入模型名称')
                .setValue(this.plugin.settings.modelName)
                .onChange(async (value) => {
                    this.plugin.settings.modelName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('AI 提示词')
            .setDesc('设置 AI 响应的提示词模板')
            .addTextArea(text => text
                .setPlaceholder('输入提示词模板')
                .setValue(this.plugin.settings.promptTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.promptTemplate = value;
                    await this.plugin.saveSettings();
                }))
            .addExtraButton(button => button
                .setIcon('reset')
                .setTooltip('重置为默认值')
                .onClick(async () => {
                    this.plugin.settings.promptTemplate = DEFAULT_SETTINGS.promptTemplate;
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }
}

// 修改视图类，继承 ItemView 而不是 View
class WeReadView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return VIEW_TYPE_WEREAD;
    }

    getDisplayText() {
        return "微信读书格式化";
    }

    getIcon() {
        return "book"; // 设置图标
    }

    async onOpen() {
        const container = this.containerEl;
        container.empty();
        container.addClass('weread-formatter-view');

        // 添加标题区域
        const headerDiv = container.createDiv({ cls: 'weread-formatter-header' });
        headerDiv.createEl("h2", { text: "微信读书笔记格式化工具" });
        
        // 创建说明容器
        const descDiv = container.createDiv({ cls: 'weread-formatter-description' });
        
        // 添加标题
        descDiv.createEl("h3", { 
            text: "使用指南",
            cls: 'weread-formatter-title'
        });

        // 添加使用说明
        const guideSection = descDiv.createDiv({ cls: 'weread-formatter-guide' });
        guideSection.createEl("h4", { 
            text: "使用步骤",
            cls: 'guide-title'
        });

        const steps = [
            {
                icon: "📋",
                text: "从微信读书复制笔记到微信（消除格式）"
            },
            {
                icon: "📝",
                text: "从微信复制并粘贴到 Obsidian 中"
            },
            {
                icon: "✨",
                text: "点击下方按钮进行格式化"
            },
            {
                icon: "🤔",
                text: "切换至阅读模式，当鼠标悬停至原文时可见 AI 按钮"
            }
        ];

        const stepsContainer = guideSection.createDiv({ cls: 'steps-container' });
        steps.forEach((step, index) => {
            const stepDiv = stepsContainer.createDiv({ cls: 'step-item' });
            stepDiv.createSpan({ cls: 'step-number', text: `${index + 1}` });
            stepDiv.createSpan({ cls: 'step-icon', text: step.icon });
            stepDiv.createSpan({ cls: 'step-text', text: step.text });
        });

        // 添加提示信息
        const tipDiv = descDiv.createDiv({ cls: 'weread-formatter-tip' });
        const tipList = [
            "💡 格式化后的笔记支持 AI 深度思考，帮助你获得更多阅读启发",
            "⚙️ 使用 AI 功能前，请在插件设置中配置 API 地址、密钥和模型"
        ];
        tipList.forEach(tip => {
            tipDiv.createEl("p", { 
                text: tip,
                cls: 'tip-text'
            });
        });

        // 添加按钮容器
        const buttonDiv = container.createDiv({ cls: 'weread-formatter-buttons' });
        const formatButton = buttonDiv.createEl("button", { 
            text: "格式化当前文档",
            cls: 'mod-cta'
        });
        
        formatButton.addEventListener("click", () => {
            // 获取当前活动叶子
            const activeLeaf = this.app.workspace.activeLeaf;
            
            const formatFile = (view: MarkdownView) => {
                const editor = view.editor;
                const content = editor.getValue();
                const formattedContent = (this.app as any).plugins.plugins["weread-formatter"].formatWeReadNotes(content);
                editor.setValue(formattedContent);
                new Notice('笔记格式化完成！');
            };

            // 如果没有活动叶子，尝试获取最后一个 Markdown 视图
            if (!activeLeaf?.view || !(activeLeaf.view instanceof MarkdownView)) {
                // 获取所有 Markdown 视图
                const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
                if (markdownLeaves.length > 0) {
                    // 使用最后一个 Markdown 视图
                    const lastMarkdownLeaf = markdownLeaves[markdownLeaves.length - 1];
                    if (lastMarkdownLeaf.view instanceof MarkdownView) {
                        const view = lastMarkdownLeaf.view as MarkdownView;
                        const fileName = view.file?.basename || "未命名文档";
                        
                        new ConfirmationModal(
                            this.app,
                            fileName,
                            () => formatFile(view)
                        ).open();
                        return;
                    }
                }
                new Notice('请先打开一个 Markdown 文件！');
                return;
            }

            // 处理当前活动的 Markdown 视图
            const view = activeLeaf.view as MarkdownView;
            const fileName = view.file?.basename || "未命名文档";
            
            new ConfirmationModal(
                this.app,
                fileName,
                () => formatFile(view)
            ).open();
        });

        // 添加 AI 按钮点击处理
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                setTimeout(() => this.addAIButtons(), 100);
            })
        );

        // 添加文件内容变化监听
        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                setTimeout(() => this.addAIButtons(), 100);
            })
        );

        // 添加预览模式变化监听
        this.registerEvent(
            this.app.workspace.on('resize', () => {
                setTimeout(() => this.addAIButtons(), 100);
            })
        );

        // 初始添加按钮
        setTimeout(() => this.addAIButtons(), 300);
    }

    private addAIButtons() {
        // 检查是否配置了 AI 服务
        const plugin = (this.app as any).plugins.plugins["weread-formatter"] as WeReadFormatter;
        if (!plugin.settings.apiUrl || !plugin.settings.apiKey || !plugin.settings.modelName) {
            return;
        }

        // 获取所有打开的 markdown 视图
        const markdownViews = this.app.workspace.getLeavesOfType("markdown");
        markdownViews.forEach(leaf => {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) return;
            
            // 获取预览元素
            const previewEl = view.previewMode?.containerEl;
            if (!previewEl) return;

            const quotes = previewEl.querySelectorAll('blockquote');
            quotes.forEach(quote => {
                // 如果已经有按钮，跳过
                if (quote.querySelector('.ai-button')) return;

                const button = createEl('button', {
                    cls: 'ai-button',
                    text: '🐌'
                });
                button.setAttr('title', '请小蜗思考');
                
                button.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const quoteText = quote.textContent?.replace('🤖', '').trim() || '';
                    
                    // 在外层容器中查找用户想法
                    let thoughtText = '';
                    const blockquoteDiv = quote.parentElement;
                    const container = blockquoteDiv?.parentElement;
                    
                    if (container) {
                        const children = Array.from(container.children);
                        const currentIndex = children.indexOf(blockquoteDiv);
                        
                        // 找到当前引用块后的第一个 el-p 元素
                        if (currentIndex !== -1 && currentIndex + 1 < children.length) {
                            const nextElement = children[currentIndex + 1];
                            if (nextElement.className === 'el-p') {
                                thoughtText = nextElement.textContent?.trim() || '';
                            }
                        }
                    }
                    
                    if (quoteText) {
                        await plugin.askAIOpinion(quoteText, thoughtText);
                    }
                });

                // 确保引用块有相对定位
                quote.style.position = 'relative';
                quote.appendChild(button);
            });
        });
    }
}

export default class WeReadFormatter extends Plugin {
    settings: WeReadFormatterSettings;
    private view: WeReadView;
    private aiService: AIService;
    private currentBookName: string = '';

    async onload() {
        // 加载设置
        await this.loadSettings();
        
        // 加载样式文件
        this.loadStyles();

        // 初始化 AI 服务
        this.aiService = new AIService(
            this.settings.apiUrl,
            this.settings.apiKey,
            this.settings.modelName,
            this.settings.promptTemplate
        );

        // 添加设置标签页
        this.addSettingTab(new WeReadFormatterSettingTab(this.app, this));

        // 添加命令到命令面板
        this.addCommand({
            id: 'format-weread-notes',
            name: '格式化微信读书笔记',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const content = editor.getValue();
                const formattedContent = this.formatWeReadNotes(content);
                editor.setValue(formattedContent);
                new Notice('笔记格式化完成！');
            }
        });

        // 注册视图
        this.registerView(
            VIEW_TYPE_WEREAD,
            (leaf) => (this.view = new WeReadView(leaf))
        );

        // 添加命令以打开视图
        this.addCommand({
            id: 'show-weread-view',
            name: '打开微信读书格式化面板',
            callback: () => {
                this.initLeaf();
            },
        });

        // 添加图标按钮到左侧边栏
        this.addRibbonIcon(
            "book",
            "微信读书格式化",
            () => {
                this.initLeaf();
            }
        );

        // 如果工作区已准备就绪，初始化视图
        if (this.app.workspace.layoutReady) {
            this.initLeaf();
        } else {
            // 否则等待工作区准备就绪后再初始化
            this.app.workspace.onLayoutReady(() => this.initLeaf());
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // 更新 AI 服务
        this.aiService = new AIService(
            this.settings.apiUrl,
            this.settings.apiKey,
            this.settings.modelName,
            this.settings.promptTemplate
        );
    }

    private async initLeaf() {
        // 如果已经存在视图，则激活它
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEREAD);
        if (existing.length) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        
        // 在右侧创建新视图
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_WEREAD,
                active: true,
            });
            // 确保新视图被激活和显示
            this.app.workspace.revealLeaf(leaf);
        }
    }

    // 加载样式文件
    private loadStyles() {
        // 加载插件的样式文件
        const styleEl = document.createElement('link');
        styleEl.rel = 'stylesheet';
        styleEl.href = this.app.vault.adapter.getResourcePath('styles.css');
        document.head.appendChild(styleEl);
    }

    // 添加新方法用于处理 AI 对话
    async askAIOpinion(quote: string, thought: string) {
        new AIResponseModal(this.app, quote, thought, this.aiService, this.currentBookName).open();
    }

    formatWeReadNotes(content: string): string {
        const lines = content.split('\n');
        const cleanedLines: string[] = [];
        
        let i = 0;
        let title = '';
        let authorNotesLine: string[] = [];
        let currentNote = {
            highlight: null as string | null,
            original: null as string | null,
            thought: null as string | null
        };
        let pendingOriginal: string | null = null;
        let pendingThought: string | null = null;

        // 获取标题
        while (i < lines.length) {
            const line = lines[i].trim();
            if (line.startsWith('《') && line.endsWith('》')) {
                title = '# ' + line;
                this.currentBookName = line;
                i++;
                break;
            }
            i++;
        }

        // 获取作者和笔记数量
        while (i < lines.length) {
            const line = lines[i].trim();
            if (!line) {
                i++;
                continue;
            }
            if (line.startsWith('文前') || line.startsWith('◆') || line.startsWith('原文：')) {
                break;
            }
            authorNotesLine.push(line);
            i++;
        }

        // 添加标题和作者信息
        if (title) {
            cleanedLines.push(title, '');
        }
        if (authorNotesLine.length > 0) {
            cleanedLines.push(authorNotesLine.join(' '), '');
        }

        const isChapterTitle = (currentLine: string, prevLine: string, nextLine: string): boolean => {
            if (!currentLine || currentLine.startsWith('◆') || currentLine.startsWith('原文：')) {
                return false;
            }

            if (prevLine && nextLine) {
                // 情况1: 上面是"x个笔记"，下面是◆
                if (prevLine.includes('笔记') && nextLine.startsWith('◆')) {
                    return true;
                }
                // 情况2: 上面是◆，下面是◆
                if (prevLine.startsWith('◆') && nextLine.startsWith('◆')) {
                    return true;
                }
                // 情况3: 上面是原文，下面是◆
                if (prevLine.startsWith('原文：') && nextLine.startsWith('◆')) {
                    return true;
                }
            }

            // 额外的启发式规则：如果是短文本（如"文前"、"自序"等）
            if (currentLine.length <= 5 && !currentLine.startsWith('原文：')) {
                return true;
            }

            return false;
        };

        const outputCurrentNote = () => {
            if (currentNote.highlight || currentNote.thought || pendingOriginal) {
                // 如果有高亮，先输出高亮
                if (currentNote.highlight) {
                    cleanedLines.push('```txt');
                    cleanedLines.push(currentNote.highlight);
                    cleanedLines.push('```');
                    cleanedLines.push('');
                }
                // 如果有暂存的原文，输出原文和对应的想法
                if (pendingOriginal) {
                    cleanedLines.push('> ' + pendingOriginal, '');
                    if (currentNote.thought) {
                        cleanedLines.push(currentNote.thought, '');
                    }
                    pendingOriginal = null;
                }
                // 如果没有原文但有想法，直接输出想法
                else if (currentNote.thought) {
                    cleanedLines.push(currentNote.thought, '');
                }
            }
            // 重置当前笔记
            currentNote = { highlight: null, original: null, thought: null };
        };

        // 处理笔记内容
        while (i < lines.length) {
            const line = lines[i].trim();

            // 跳过空行和时间戳
            if (!line || line.includes('发表想法') || line.includes('-- 来自微信读书')) {
                i++;
                continue;
            }

            // 获取上下文
            const prevLine = i > 0 ? lines[i - 1].trim() : '';
            const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

            // 检查是否是章节标题
            if (isChapterTitle(line, prevLine, nextLine)) {
                outputCurrentNote();
                pendingThought = null;
                cleanedLines.push('## ' + line, '');
                i++;
                continue;
            }

            // 处理高亮
            if (line.startsWith('◆')) {
                outputCurrentNote();
                pendingThought = null;
                currentNote.highlight = line;
            }
            // 处理原文
            else if (line.startsWith('原文：')) {
                const originalText = line.substring(3);
                // 如果有待处理的想法，先输出原文，再输出想法
                if (pendingThought) {
                    cleanedLines.push('> ' + originalText, '');
                    cleanedLines.push(pendingThought, '');
                    pendingThought = null;
                } else {
                    // 否则正常处理原文
                    if (currentNote.highlight || currentNote.thought) {
                        outputCurrentNote();
                    }
                    pendingOriginal = originalText;
                }
            }
            // 处理用户想法
            else if (!line.startsWith('◆') && !line.startsWith('原文：') && line.length > 0) {
                // 如果有待处理的原文，说明这是配对的想法
                if (pendingOriginal) {
                    cleanedLines.push('> ' + pendingOriginal, '');
                    cleanedLines.push(line, '');
                    pendingOriginal = null;
                }
                // 否则，暂存这个想法，等待后面的原文
                else {
                    if (currentNote.thought) {
                        outputCurrentNote();
                    }
                    pendingThought = line;
                }
            }

            i++;
        }

        // 处理最后一组笔记
        outputCurrentNote();
        // 处理可能剩余的待处理想法
        if (pendingThought) {
            cleanedLines.push(pendingThought, '');
        }

        return cleanedLines.join('\n');
    }

    onunload() {
        console.log('卸载微信读书格式化插件');
    }
}