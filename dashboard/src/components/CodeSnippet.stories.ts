import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeSnippet } from './CodeSnippet';

const meta = {
  title: 'Components/CodeSnippet',
  component: CodeSnippet,
  argTypes: {
    language: {
      control: 'select',
      options: ['bash', 'javascript', 'python'],
    },
  },
} satisfies Meta<typeof CodeSnippet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bash: Story = {
  args: {
    label: 'cURL',
    language: 'bash',
    code: `curl -X POST http://localhost:3002/api/ingest \\
  -H "Authorization: Bearer mb_your_token" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello, memory box!"}'`,
  },
};

export const JavaScript: Story = {
  args: {
    label: 'JavaScript',
    language: 'javascript',
    code: `const res = await fetch('http://localhost:3002/api/ingest', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer mb_your_token',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ content: 'Hello, memory box!' }),
});
const data = await res.json();
console.log(data);`,
  },
};

export const Python: Story = {
  args: {
    label: 'Python',
    language: 'python',
    code: `import requests

res = requests.post(
    "http://localhost:3002/api/ingest",
    headers={"Authorization": "Bearer mb_your_token"},
    json={"content": "Hello, memory box!"},
)
print(res.json())`,
  },
};
