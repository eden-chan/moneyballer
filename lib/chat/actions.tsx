import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { openai } from '@ai-sdk/openai'
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});
import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks'

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat, Message } from '@/lib/types'
import { auth } from '@/auth'
import { DeveloperListSkeleton } from '@/components/developers/developer-list-skeleton'
import { DeveloperList } from '@/components/developers/developer-list'
async function confirmPurchase(symbol: string, price: number, amount: number) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Purchasing {amount} ${symbol}...
      </p>
    </div>
  )

  const systemMessage = createStreamableUI(null)

  runAsyncFnWithoutBlocking(async () => {
    await sleep(1000)

    purchasing.update(
      <div className="inline-flex items-start gap-1 md:items-center">
        {spinner}
        <p className="mb-2">
          Purchasing {amount} ${symbol}... working on it...
        </p>
      </div>
    )

    await sleep(1000)

    purchasing.done(
      <div>
        <p className="mb-2">
          You have successfully purchased {amount} ${symbol}. Total cost:{' '}
          {formatNumber(amount * price)}
        </p>
      </div>
    )

    systemMessage.done(
      <SystemMessage>
        You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
        {formatNumber(amount * price)}.
      </SystemMessage>
    )

    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'system',
          content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${amount * price
            }]`
        }
      ]
    })
  })

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: nanoid(),
      display: systemMessage.value
    }
  }
}

async function submitUserMessage(content: string) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const result = await streamUI({
    model: groq('llama3-8b-8192'),
    initial: <SpinnerMessage />,
    system: `\
    You are an AI assistant for MoneyBaller, a platform that identifies undervalued developer talent in the open-source community. Your role is to help users discover exceptional developers who may be overlooked by traditional recruitment methods.

    When interacting with users, focus on understanding their specific talent needs and use data-driven analysis to find suitable candidates. You should emphasize the platform's ability to uncover "hidden geniuses" through sophisticated analysis of GitHub contributions and open-source projects.

    Your primary function is to call the \`getDevelopers\` tool to showcase potential candidates. This tool analyzes:
    1. Code proficiency with specific technologies
    2. GitHub activity to evaluate work ethic and consistency
    3. Contribution patterns to identify exceptional but less visible skills

    When presenting developers, highlight their unique strengths, potential for growth, and how they align with the "Moneyball" strategy of identifying undervalued assets in tech recruitment.

    If users ask about other features or tools, explain that MoneyBaller is focused solely on developer talent discovery and cannot perform other tasks.

    Remember to maintain a professional and analytical tone, emphasizing the data-driven approach of MoneyBaller in revolutionizing tech recruitment.`,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
      listStocks: {
        description: 'List three imaginary stocks that are trending.',
        parameters: z.object({
          stocks: z.array(
            z.object({
              symbol: z.string().describe('The symbol of the stock'),
              price: z.number().describe('The price of the stock'),
              delta: z.number().describe('The change in price of the stock')
            })
          )
        }),
        generate: async function* ({ stocks }) {
          yield (
            <BotCard>
              <StocksSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'listStocks',
                    toolCallId,
                    args: { stocks }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'listStocks',
                    toolCallId,
                    result: stocks
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <Stocks props={stocks} />
            </BotCard>
          )
        }
      },
      showStockPrice: {
        description:
          'Get the current stock price of a given stock or currency. Use this to show the price to the user.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            ),
          price: z.number().describe('The price of the stock.'),
          delta: z.number().describe('The change in price of the stock')
        }),
        generate: async function* ({ symbol, price, delta }) {
          yield (
            <BotCard>
              <StockSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'showStockPrice',
                    toolCallId,
                    args: { symbol, price, delta }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'showStockPrice',
                    toolCallId,
                    result: { symbol, price, delta }
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <Stock props={{ symbol, price, delta }} />
            </BotCard>
          )
        }
      },
      showStockPurchase: {
        description:
          'Show price and the UI to purchase a stock or currency. Use this if the user wants to purchase a stock or currency.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
            ),
          price: z.number().describe('The price of the stock.'),
          numberOfShares: z
            .number()
            .optional()
            .describe(
              'The **number of shares** for a stock or currency to purchase. Can be optional if the user did not specify it.'
            )
        }),
        generate: async function* ({ symbol, price, numberOfShares = 100 }) {
          const toolCallId = nanoid()

          if (numberOfShares <= 0 || numberOfShares > 1000) {
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      args: { symbol, price, numberOfShares }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      result: {
                        symbol,
                        price,
                        numberOfShares,
                        status: 'expired'
                      }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'system',
                  content: `[User has selected an invalid amount]`
                }
              ]
            })

            return <BotMessage content={'Invalid amount'} />
          } else {
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      args: { symbol, price, numberOfShares }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockPurchase',
                      toolCallId,
                      result: {
                        symbol,
                        price,
                        numberOfShares
                      }
                    }
                  ]
                }
              ]
            })

            return (
              <BotCard>
                <Purchase
                  props={{
                    numberOfShares,
                    symbol,
                    price: +price,
                    status: 'requires_action'
                  }}
                />
              </BotCard>
            )
          }
        }
      },
      getEvents: {
        description:
          'List funny imaginary events between user highlighted dates that describe stock activity.',
        parameters: z.object({
          events: z.array(
            z.object({
              date: z
                .string()
                .describe('The date of the event, in ISO-8601 format'),
              headline: z.string().describe('The headline of the event'),
              description: z.string().describe('The description of the event')
            })
          )
        }),
        generate: async function* ({ events }) {
          yield (
            <BotCard>
              <EventsSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'getEvents',
                    toolCallId,
                    args: { events }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'getEvents',
                    toolCallId,
                    result: events
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <Events props={events} />
            </BotCard>
          )
        }
      },
      getDevelopers: {
        description: 'Get a list of undervalued developers based on GitHub data.',
        parameters: z.object({
          count: z.number().optional().describe('The number of developers to retrieve. Default is 5.')
        }),
        generate: async function* ({ count = 5 }) {
          yield (
            <BotCard>
              <div className="space-y-2">
                <p>🔍 Searching for undervalued developers...</p>
                <DeveloperListSkeleton />
              </div>
            </BotCard>
          )

          await sleep(3000)

          yield (
            <BotCard>
              <div className="space-y-2">
                <p>🔍 Searching for undervalued developers...</p>
                <p>📊 Evaluating open source contributions...</p>
                <DeveloperListSkeleton />
              </div>
            </BotCard>
          )

          await sleep(3000)

          yield (
            <BotCard>
              <div className="space-y-2">
                <p>🔍 Searching for undervalued developers...</p>
                <p>📊 Evaluating open source contributions...</p>
                <p>🧪 Analyzing Python files for code quality...</p>
                <DeveloperListSkeleton />
              </div>
            </BotCard>
          )

          await sleep(3000)

          const sampleDevelopers = [
            {
              "average_score": 7.666666666666667,
              "analysis_rate": 100.0,
              "repo_url": "https://github.com/LinglongQian/JILIANG",
              "user_url": "https://github.com/LinglongQian",
              "summary": "This Python codebase appears to be related to the AllenNLP library, which is an open-source natural language processing (NLP) library built on top of PyTorch. The codebase consists of three main scripts:\n\n1. **Main Script**:\nThis script sets up the logging configuration for AllenNLP based on the environment variable `ALLENNLP_DEBUG`. If the variable is set, the logging level is set to `DEBUG`, otherwise, it is set to `INFO`. It then imports the `main` function from the `allennlp.commands` module and runs it with the program name `\"allennlp\"`.\n\n2. **Link Checker Script**:\nThis script checks the validity of inline links in Markdown files within the project directory. It uses regular expressions to find all links in Markdown files and then checks if each link is reachable or if the linked file exists within the repository. The script uses multithreading to speed up the checking process and reports any unreachable links along with their source files and reasons for failure.\n\n3. **Iterator Benchmarking Script**:\nThis script benchmarks the iterator (and indirectly the dataset reader) for a given AllenNLP configuration. It provides three different actions:\n   - `log`: Logs statistics about the iterator every 100 batches, including seconds per batch, batch count, and batch size. It also periodically outputs internal information about the `MultiprocessDatasetReader` and `MultiprocessIterator`.\n   - `time`: Outputs the average seconds per batch over a specified number of batches.\n   - `first`: Outputs the time taken to produce the first batch, which can be useful for measuring overhead.\n\nThe benchmarking script uses the `TrainerPieces` class from AllenNLP to set up the iterator and dataset based on the provided configuration file and serialization directory.\n\nOverall, this codebase contains utility scripts for logging, link checking, and benchmarking related to the AllenNLP library. The main functionality seems to be focused on setting up the logging configuration, validating inline links in documentation, and benchmarking the performance of the iterator and dataset reader components."
            },
            {
              "average_score": 8.5,
              "analysis_rate": 8.5,
              "repo_url": "https://github.com/WenjieDu/Awesome_Imputation",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, manage user profiles, and allow users to create and share blog posts. Here's a concise summary of the main functionality, key components, and overall structure:\n\n1. **Authentication**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out.\n   - Password hashing is implemented using the Werkzeug security utilities.\n\n2. **User Profiles**:\n   - Each user has a profile with a username, email, profile picture, and other information.\n   - Users can update their profile information, including changing their profile picture.\n\n3. **Blog Posts**:\n   - Authenticated users can create new blog posts with a title, content, and optional image.\n   - Posts are displayed on the home page, and users can view individual post details.\n   - Users can update and delete their own posts.\n\n4. **Database**:\n   - The application uses Flask-SQLAlchemy for database management.\n   - The database models include `User` for user information and `Post` for blog posts.\n   - Database migrations are handled using Flask-Migrate.\n\n5. **File Uploads**:\n   - Users can upload profile pictures and post images.\n   - The application uses Flask-WTF and Pillow for handling file uploads and image processing.\n   - Uploaded files are stored in the `static/profile_pics` and `static/post_pics` directories.\n\n6. **Forms**:\n   - The application uses Flask-WTF for form handling and validation.\n   - Forms include `RegistrationForm`, `LoginForm`, `UpdateAccountForm`, and `PostForm`.\n\n7. **Routing**:\n   - The application defines various routes using Flask's routing mechanisms.\n   - Routes include `/register`, `/login`, `/logout`, `/account`, `/post/new`, `/post/<int:post_id>`, and others.\n\n8. **Templates**:\n   - The application uses Jinja2 templates for rendering HTML pages.\n   - Templates are organized in the `templates` directory and include `layout.html`, `register.html`, `login.html`, `account.html`, `post.html`, and others.\n\n9. **Error Handling**:\n   - The application includes error handlers for 404 (Page Not Found) and 500 (Internal Server Error) errors.\n\n10. **Configuration**:\n    - The application uses a configuration file (`config.py`) to store sensitive information like the secret key and database URI.\n\nOverall, the codebase follows the Model-View-Controller ("
            },
            {
              "average_score": 8.0,
              "analysis_rate": 100.0,
              "repo_url": "https://github.com/AugustJW/PyPOTS",
              "user_url": "https://github.com/AugustJW",
              "summary": "This Python codebase appears to be a configuration file for the Sphinx documentation builder, which is used to generate documentation for the PyPOTS project. Here's a summary of the key components and functionality:\n\n1. **Project Information**: The code sets up basic project information such as the project name, author, copyright year, and version number.\n\n2. **Sphinx Extensions**: It imports and configures various Sphinx extensions, including `autodoc` for automatically documenting code, `napoleon` for parsing NumPy and Google-style docstrings, `intersphinx` for linking to other project documentation, and `bibtex` for including bibliographic references.\n\n3. **Extension Configurations**: The code configures various settings for the imported extensions, such as the order of documented members, parsing parameters in docstrings, and linking to external documentation.\n\n4. **HTML Output**: It sets up configurations for the HTML output, including the theme, static file paths, and sidebar layout.\n\n5. **Docstring Parsing**: The code includes a custom function to fix the display of \"Attributes\" and \"Keys\" headings in NumPy docstrings, which is a common issue with the Napoleon extension.\n\n6. **Base Optimizer Class**: The code also includes a base class `Optimizer` for PyTorch optimizers, which serves as the foundation for all optimizers in the `pypots.optim` module. This class provides a wrapper around PyTorch optimizers, allowing for additional functionality such as learning rate scheduling.\n\nOverall, this codebase sets up the documentation build environment for the PyPOTS project, configuring various Sphinx extensions and settings to generate comprehensive and well-formatted documentation. Additionally, it includes a base class for PyTorch optimizers, which is likely used throughout the PyPOTS project."
            }
          ];

          const developers = sampleDevelopers.slice(0, count);

          const toolCallId = nanoid()

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'getDevelopers',
                    toolCallId,
                    args: { count }
                  }
                ]
              },
              {
                id: nanoid(),
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolName: 'getDevelopers',
                    toolCallId,
                    result: developers
                  }
                ]
              }
            ]
          })

          return (
            <BotCard>
              <DeveloperList developers={developers} />
            </BotCard>
          )
        }
      }
    }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    confirmPurchase
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState() as Chat

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      const firstMessageContent = messages[0].content as string
      const title = firstMessageContent.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
          message.content.map(tool => {
            return tool.toolName === 'listStocks' ? (
              <BotCard>
                {/* TODO: Infer types based on the tool result*/}
                {/* @ts-expect-error */}
                <Stocks props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPrice' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Stock props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPurchase' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Purchase props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'getEvents' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Events props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'getDevelopers' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <DeveloperList developers={tool.result} />
              </BotCard>
            ) : null
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
