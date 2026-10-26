# Prompt tips

General guidance. Field names, allowed values and limits always come from `get_model_docs`.

## Images

- Lead with the subject, then setting, style, lighting and composition.
- Put any exact text that must appear in the image in quotes, and say where it goes.
- For edits, say what must stay unchanged as well as what to change, and pass reference images by the URLs returned from uploads.
- Use the documented size or aspect ratio field instead of describing dimensions in the prompt.

## Videos

- Describe one shot: subject, action, camera movement and mood. Keep it short; long multi-scene prompts tend to be ignored.
- State camera motion explicitly (static, slow push in, pan left) when it matters.
- Use the documented duration, resolution and aspect ratio fields; do not rely on the prompt for them.
- For image-to-video, upload the first frame and pass its URL in the documented field.

## Iterating

- Change one thing at a time and keep the rest of the prompt identical.
- Use a cheaper or faster model for drafts, then the final model once the prompt works.
