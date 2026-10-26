# Model routing

Starting points only. Confirm availability and price with `list_models`, and read parameters with `get_model_docs` before every generation. Maintained by ToAPIs; every model ID here has documentation available.

## Video (Seedance first)

| Scenario | Recommended model ID | Why |
|---|---|---|
| Default video generation | `seedance-2-5` | Newest Seedance model and the most used video model on ToAPIs |
| Low-cost drafts and iteration | `seedance-2-mini` | Cheapest Seedance 2 option |
| Faster turnaround | `seedance-2-fast` | Shorter wait than `seedance-2` |
| Seedance 2 standard quality | `seedance-2` | Use when the user asks for Seedance 2 specifically |

## Images

| Scenario | Recommended model ID | Why |
|---|---|---|
| Default image generation and edits | `gpt-image-2` | The most used image model on ToAPIs |
| Gemini style, or when the user asks for Gemini | `gemini-3-pro-image-preview` | Widely used Gemini image model |

Image generations usually run as tasks: expect `state: running` with a `task_id` and follow up with `get_generation`.
