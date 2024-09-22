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
    You are a stock trading conversation bot and you can help users buy stocks, step by step.
    You and the user can discuss stock prices and the user can adjust the amount of stocks they want to buy, or place an order, in the UI.
    
    Messages inside [] means that it's a UI element or a user event. For example:
    - "[Price of AAPL = 100]" means that an interface of the stock price of AAPL is shown to the user.
    - "[User has changed the amount of AAPL to 10]" means that the user has changed the amount of AAPL to 10 in the UI.
    
    If the user requests purchasing a stock, call \`show_stock_purchase_ui\` to show the purchase UI.
    If the user just wants the price, call \`show_stock_price\` to show the price.
    If you want to show trending stocks, call \`list_stocks\`.
    If you want to show events, call \`get_events\`.
    If you want to show developers, call \`get_developers\`.
    If the user wants to sell stock, or complete another impossible task, respond that you are a demo and cannot do that.
    
    Besides that, you can also chat with users and do some calculations if needed.`,
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
              <DeveloperListSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const sampleDevelopers = [
            {
              "average_score": 8.5,
              "analysis_rate": 8.5,
              "repo_url": "https://github.com/WenjieDu/Awesome_Imputation",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, manage user profiles, and allow users to create and share blog posts. Here's a concise summary of the main functionality, key components, and overall structure:\n\n1. **Authentication**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out.\n   - Password hashing is implemented using the Werkzeug security utilities.\n\n2. **User Profiles**:\n   - Each user has a profile with a username, email, profile picture, and other information.\n   - Users can update their profile information, including changing their profile picture.\n\n3. **Blog Posts**:\n   - Authenticated users can create new blog posts with a title, content, and optional image.\n   - Posts are displayed on the home page, and users can view individual post details.\n   - Users can update and delete their own posts.\n\n4. **Database**:\n   - The application uses Flask-SQLAlchemy for database management.\n   - The database models include `User` for user information and `Post` for blog posts.\n   - Database migrations are handled using Flask-Migrate.\n\n5. **File Uploads**:\n   - Users can upload profile pictures and post images.\n   - The application uses Flask-WTF and Pillow for handling file uploads and image processing.\n   - Uploaded files are stored in the `static/profile_pics` and `static/post_pics` directories.\n\n6. **Forms**:\n   - The application uses Flask-WTF for form handling and validation.\n   - Forms include `RegistrationForm`, `LoginForm`, `UpdateAccountForm`, and `PostForm`.\n\n7. **Routing**:\n   - The application defines various routes using Flask's routing mechanisms.\n   - Routes include `/register`, `/login`, `/logout`, `/account`, `/post/new`, `/post/<int:post_id>`, and others.\n\n8. **Templates**:\n   - The application uses Jinja2 templates for rendering HTML pages.\n   - Templates are organized in the `templates` directory and include `layout.html`, `register.html`, `login.html`, `account.html`, `post.html`, and others.\n\n9. **Error Handling**:\n   - The application includes error handlers for 404 (Page Not Found) and 500 (Internal Server Error) errors.\n\n10. **Configuration**:\n    - The application uses a configuration file (`config.py`) to store sensitive information like the secret key and database URI.\n\nOverall, the codebase follows the Model-View-Controller ("
            },
            {
              "average_score": 7.8,
              "analysis_rate": 7.8,
              "repo_url": "https://github.com/WenjieDu/.github",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, manage user profiles, and allow users to create and share blog posts. Here's a concise summary of the main functionality, key components, and overall structure:\n\n1. **Authentication**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out.\n   - Password hashing is implemented using the Werkzeug security utilities.\n\n2. **User Profiles**:\n   - Each user has a profile with a username, email, and profile picture.\n   - Users can update their profile information.\n   - Profile pictures are stored and served from the application's static folder.\n\n3. **Blog Posts**:\n   - Authenticated users can create new blog posts.\n   - Posts have a title, content, and a timestamp indicating when they were posted.\n   - Users can view all posts or filter posts by a specific user.\n   - Posts are stored in a SQLite database using Flask-SQLAlchemy.\n\n4. **Database Models**:\n   - The `User` model represents user information (username, email, password hash, profile picture).\n   - The `Post` model represents blog posts (title, content, timestamp, user_id as a foreign key).\n\n5. **Routes**:\n   - The application defines various routes for handling different functionalities.\n   - Routes include user registration, login, logout, account management, post creation, and post listing.\n\n6. **Forms**:\n   - Flask-WTF is used for form handling and validation.\n   - Forms include `RegistrationForm`, `LoginForm`, `UpdateAccountForm`, and `PostForm`.\n\n7. **Templates**:\n   - The application uses Jinja2 templates for rendering HTML pages.\n   - Templates are organized into separate files for layout, user accounts, posts, and error handling.\n\n8. **Static Files**:\n   - The `static` folder contains CSS stylesheets and a directory for storing user profile pictures.\n\n9. **Configuration**:\n   - The application uses a configuration file (`config.py`) to store sensitive information like the secret key and database URI.\n\n10. **Error Handling**:\n    - Custom error handlers are implemented for 404 (Page Not Found) and 500 (Internal Server Error) errors.\n\nThe overall structure follows the Model-View-Controller (MVC) architectural pattern, with models defined for the database, views implemented as routes, and templates for rendering the user interface. The application leverages various Flask extensions and adheres to best practices for web application development in Python."
            },
            {
              "average_score": 8.2,
              "analysis_rate": 8.2,
              "repo_url": "https://github.com/WenjieDu/awesome-time-series",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, manage user profiles, and allow users to create and share blog posts. Here's a concise summary of the main functionality, key components, and overall structure:\n\n1. **Authentication and User Management**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out of the application.\n   - User information, including usernames, email addresses, and hashed passwords, is stored in a SQLite database using Flask-SQLAlchemy.\n   - User roles (e.g., regular user, administrator) are implemented.\n\n2. **User Profiles**:\n   - Authenticated users can update their profile information, including their username, email address, and profile picture.\n   - Profile pictures are stored in the file system, and their paths are saved in the database.\n\n3. **Blog Posts**:\n   - Authenticated users can create, update, and delete their own blog posts.\n   - Blog posts are stored in the database and associated with the user who created them.\n   - Posts can be marked as drafts or published.\n   - Published posts are visible to all users, while draft posts are only visible to their authors.\n\n4. **Commenting System**:\n   - Users can leave comments on published blog posts.\n   - Comments are stored in the database and associated with the respective post and the user who left the comment.\n\n5. **Pagination**:\n   - The application implements pagination for displaying blog posts and comments, limiting the number of items shown per page.\n\n6. **Error Handling**:\n   - Custom error pages (404 and 500) are implemented to handle page not found and internal server errors.\n\n7. **Email Notifications**:\n   - The application uses Flask-Mail to send email notifications to users for various events, such as account registration and password reset.\n\n8. **File Uploads**:\n   - Users can upload profile pictures, which are stored in the file system.\n\n9. **Admin Panel**:\n   - An admin panel is available for administrators to manage users, posts, and comments.\n   - Administrators can delete users, posts, and comments from the admin panel.\n\n10. **Caching**:\n    - The application implements caching using Flask-Caching to improve performance by caching frequently accessed data.\n\n11. **Logging**:\n    - The application logs errors and other events using the built-in Python logging module.\n\n12. **Configuration**:\n    - Application configuration settings, such as database connection details, secret keys, and email server settings, are stored in a separate configuration file.\n\nThe codebase follows the"
            },
            {
              "average_score": 7.9,
              "analysis_rate": 7.9,
              "repo_url": "https://github.com/WenjieDu/BenchPOTS",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, manage user profiles, and allow users to create and share blog posts. Here's a concise summary of the main functionality, key components, and overall structure:\n\n1. **Authentication**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out.\n   - Password hashing is implemented using the Werkzeug security utilities.\n\n2. **User Profiles**:\n   - Each user has a profile with a username, email, profile picture, and other information.\n   - Users can update their profile information, including changing their profile picture.\n\n3. **Blog Posts**:\n   - Authenticated users can create new blog posts with a title, content, and optional image.\n   - Posts are displayed on the home page, and users can view individual post details.\n   - Users can update and delete their own posts.\n\n4. **Database**:\n   - The application uses Flask-SQLAlchemy for database management.\n   - The database models include `User` for user information and `Post` for blog posts.\n   - Database migrations are handled using Flask-Migrate.\n\n5. **File Uploads**:\n   - Users can upload profile pictures and post images.\n   - Uploaded files are stored in the `static/profile_pics` and `static/post_pics` directories.\n   - File handling is implemented using the `secure_filename` function and `os` module.\n\n6. **Pagination**:\n   - The home page displays blog posts with pagination support.\n   - Pagination is implemented using Flask-SQLAlchemy's `paginate` method.\n\n7. **Email Notifications**:\n   - The application uses Flask-Mail to send email notifications.\n   - Email notifications are sent when a new user registers or a new post is created.\n\n8. **Blueprints**:\n   - The application is structured using Flask Blueprints, separating different functionality into separate modules.\n   - The main blueprints include `users` for user-related routes, `posts` for blog post routes, and `main` for general routes.\n\n9. **Templates**:\n   - The application uses Jinja2 templates for rendering HTML pages.\n   - Templates are organized into separate directories for different components (e.g., `users`, `posts`, `layouts`).\n\n10. **Configuration**:\n    - The application configuration is stored in a separate `config.py` file.\n    - Configuration settings include database URI, secret key, mail server settings, and others.\n\n11. **Error Handling**:\n    - Custom error"
            },
            {
              "average_score": 8.7,
              "analysis_rate": 8.7,
              "repo_url": "https://github.com/WenjieDu/BrewPOTS",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a command-line interface (CLI) application for managing a to-do list. Here's a concise summary of its main functionality, key components, and overall structure:\n\n1. **Main Functionality**:\n   - The application allows users to create, read, update, and delete (CRUD) tasks in a to-do list.\n   - Users can perform various operations on the tasks, such as listing all tasks, marking tasks as complete or incomplete, and deleting tasks.\n   - The application uses a SQLite database to store and retrieve task data persistently.\n\n2. **Key Components**:\n   - **Database Management**: The code includes functions for creating the initial database and tables if they don't exist, as well as functions for executing SQL queries (e.g., `create_table`, `execute_query`).\n   - **Task Management**: Several functions handle CRUD operations on tasks, such as `add_task`, `mark_task`, `delete_task`, and `show_tasks`.\n   - **User Interface**: The `main` function serves as the entry point and provides a command-line interface for users to interact with the application. It uses a loop to continuously prompt the user for input and execute the corresponding actions.\n   - **Input Validation**: The code includes helper functions like `get_task_with_index` and `get_task_with_value` to validate user input and retrieve task data based on provided indices or values.\n\n3. **Overall Structure**:\n   - The code is organized into several functions, each responsible for a specific task or operation.\n   - The `main` function acts as the central control point, handling user input and calling the appropriate functions based on the user's choice.\n   - The code utilizes the `sqlite3` module for database operations and the `os` module for checking if the database file exists.\n   - Error handling is implemented using try-except blocks to catch and handle exceptions that may occur during database operations or user input validation.\n   - The application runs in an infinite loop, continuously prompting the user for input until the user chooses to exit.\n\nIn summary, this Python codebase provides a command-line interface for managing a to-do list. It allows users to create, read, update, and delete tasks, with the task data being stored and retrieved from a SQLite database. The code is structured into separate functions for different operations, with the `main` function acting as the central control point for user interaction and task management."
            },
            {
              "average_score": 8.3,
              "analysis_rate": 8.3,
              "repo_url": "https://github.com/WenjieDu/DevNet",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, manage user profiles, and allow users to create and share blog posts. Here's a summary of the main functionality, key components, and overall structure:\n\n1. **Authentication**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out.\n   - Password hashing is implemented using the Werkzeug security utilities.\n\n2. **User Profiles**:\n   - Each user has a profile with a username, email, and profile picture.\n   - Users can update their profile information, including changing their username, email, and profile picture.\n\n3. **Blog Posts**:\n   - Authenticated users can create new blog posts.\n   - Posts have a title, content, and a timestamp indicating when they were posted.\n   - Users can view all posts, as well as individual post details.\n   - Posts are displayed in reverse chronological order (newest first).\n\n4. **Database**:\n   - The application uses Flask-SQLAlchemy for database management.\n   - Two main models are defined: `User` and `Post`.\n   - The `User` model stores user information, including username, email, password hash, and profile picture.\n   - The `Post` model stores blog post data, including title, content, timestamp, and the author (a `User` instance).\n\n5. **File Uploads**:\n   - The application allows users to upload profile pictures.\n   - Uploaded files are saved in the `app/static/profile_pics` directory.\n   - File handling is implemented using Flask's `request.files` and the `secure_filename` function.\n\n6. **Routing and Views**:\n   - The application defines various routes using Flask's `@app.route` decorator.\n   - Routes handle different functionalities, such as rendering templates, user authentication, creating posts, and updating user profiles.\n   - Templates are rendered using Jinja2 templating engine.\n\n7. **Forms**:\n   - Flask-WTF is used for form handling and validation.\n   - Forms are defined for user registration, login, account updates, and creating new posts.\n\n8. **Configuration**:\n   - The application uses a configuration file (`config.py`) to store sensitive information like the secret key and database URI.\n   - Different configurations can be set for development and production environments.\n\n9. **Error Handling**:\n   - Custom error handlers are implemented for 404 (Page Not Found) and 500 (Internal Server Error) errors.\n\n10. **Utilities**:\n    - The codebase includes utility functions for"
            },
            {
              "average_score": 8.1,
              "analysis_rate": 8.1,
              "repo_url": "https://github.com/WenjieDu/eye_game",
              "user_url": "https://github.com/WenjieDu",
              "summary": "The provided Python codebase appears to be a web application built using the Flask framework. It is designed to handle user authentication, file uploads, and file processing. Here's a concise summary of the main functionality, key components, and overall structure:\n\n1. **User Authentication**:\n   - The application uses Flask-Login for user authentication.\n   - Users can register, log in, and log out.\n   - User information is stored in a SQLite database using Flask-SQLAlchemy.\n\n2. **File Upload and Processing**:\n   - Users can upload files to the application.\n   - Uploaded files are stored in the `uploads` directory.\n   - The application supports processing uploaded files using external scripts or libraries.\n   - File processing is handled asynchronously using Celery and RabbitMQ.\n\n3. **Key Components**:\n   - **Routes**: The application defines various routes for handling different functionalities, such as user authentication, file upload, and file processing.\n   - **Models**: The `User` model represents user information stored in the database.\n   - **Forms**: The application uses Flask-WTF for form handling, including registration, login, and file upload forms.\n   - **Celery Tasks**: Celery tasks are defined for processing uploaded files asynchronously.\n   - **Utilities**: Various utility functions are provided for file handling, script execution, and other helper tasks.\n\n4. **Overall Structure**:\n   - The application is structured using the Model-View-Controller (MVC) pattern.\n   - The `app.py` file serves as the main entry point and contains the Flask application setup, route definitions, and other configurations.\n   - The `models.py` file defines the database models.\n   - The `forms.py` file contains the form definitions.\n   - The `tasks.py` file defines the Celery tasks for file processing.\n   - The `utils.py` file contains utility functions.\n   - The `templates` directory holds the HTML templates for rendering web pages.\n   - The `static` directory contains static files like CSS and JavaScript files.\n\n5. **Dependencies**:\n   - The application relies on several Python libraries and frameworks, including Flask, Flask-Login, Flask-SQLAlchemy, Flask-WTF, Celery, and RabbitMQ.\n\n6. **Configuration**:\n   - The application can be configured using environment variables or a separate configuration file.\n   - Configuration settings include database connection details, secret keys, and other application-specific settings.\n\nOverall, this Python codebase provides a web application with user authentication, file upload capabilities, and asynchronous file processing using Celery and RabbitMQ. It follows the"
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
