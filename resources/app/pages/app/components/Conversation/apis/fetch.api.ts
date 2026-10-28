import {
  createMediaJob,
  fetchJobStatus,
  fetchMediaChat,
} from './apis'
import { artifactUrl, resolveMediaUrl } from './api.helper'
import { MediaChatEventPayload, MediaJobResult, MediaPromptProgressEvent, MediaPromptResult, RunMediaPromptOptions } from './types'

function firstString(...values: Array<string | undefined | null>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null
}

function firstNestedResult(result: MediaJobResult): MediaJobResult | null {
  return result.output ?? result.image ?? result.artifacts?.[0] ?? result.outputs?.[0] ?? result.files?.[0] ?? null
}

export function outputUrlsFromResult(result: MediaJobResult) {
  const nested = firstNestedResult(result)
  const directUrls = result.output_urls ?? result.data?.output_urls ?? nested?.output_urls ?? nested?.data?.output_urls
  if (directUrls?.length) return directUrls.map(resolveMediaUrl)

  const directUrl = firstString(
    result.output_url,
    result.outputUrl,
    result.artifact_url,
    result.artifactUrl,
    result.download_url,
    result.downloadUrl,
    result.image_url,
    result.imageUrl,
    result.output_path,
    result.outputPath,
    result.path,
    result.url,
    nested?.output_url,
    nested?.outputUrl,
    nested?.artifact_url,
    nested?.artifactUrl,
    nested?.download_url,
    nested?.downloadUrl,
    nested?.image_url,
    nested?.imageUrl,
    nested?.path,
    nested?.url,
  )

  if (directUrl) return [resolveMediaUrl(directUrl)]

  const outputRefs = result.data?.output_refs ?? result.output_refs ?? nested?.data?.output_refs ?? nested?.output_refs
  if (outputRefs?.length) {
    return outputRefs.map((outputRef) => artifactUrl(result.data?.tool_id ?? result.tool_id ?? nested?.data?.tool_id ?? nested?.tool_id, outputRef))
  }

  return []
}

function outputUrlsFromChatPayload(payload: MediaChatEventPayload) {
  const data = payload.data
  const directUrls = payload.output_urls ?? data?.output_urls
  if (directUrls?.length) return directUrls.map(resolveMediaUrl)

  const directUrl = firstString(payload.output_url, payload.outputUrl, data?.output_url, data?.outputUrl)
  if (directUrl) return [resolveMediaUrl(directUrl)]

  const outputRefs = payload.output_refs ?? data?.output_refs
  if (outputRefs?.length) {
    return outputRefs.map((outputRef) => artifactUrl(payload.tool_id ?? data?.tool_id, outputRef))
  }

  if (payload.result) return outputUrlsFromResult(payload.result)
  if (data?.result) return outputUrlsFromResult(data.result)

  return []
}

function jobIdFromPayload(payload: MediaChatEventPayload) {
  const data = payload.data
  return firstString(
    payload.job_id,
    payload.jobID,
    payload.jobId,
    payload.job?.job_id,
    payload.job?.jobID,
    payload.job?.id,
    data?.job_id,
    data?.jobID,
    data?.jobId,
    data?.job?.job_id,
    data?.job?.jobID,
    data?.job?.id,
  )
}

function messageFromChatEvent(event: string, payload: MediaChatEventPayload) {
  const data = payload.data
  return firstString(
    payload.delta,
    payload.content,
    payload.message,
    payload.label,
    payload.summary,
    payload.text,
    data?.delta,
    data?.content,
    data?.message,
    data?.label,
    data?.summary,
    data?.text,
  ) ?? (event === 'done' ? null : event.replace(/_/g, ' '))
}

function parseSseEvent(eventText: string) {
  const lines = eventText.split('\n')
  const event = lines
    .find((line) => line.startsWith('event:'))
    ?.slice('event:'.length)
    .trim() || 'message'
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')

  if (!data) return null

  return { event, data }
}

function isTerminalSuccess(status: string | undefined) {
  return status === 'succeeded' || status === 'completed' || status === 'success'
}

function isTerminalFailure(status: string | undefined) {
  return status === 'failed' || status === 'error' || status === 'cancelled'
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeoutId = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

async function streamChatForJob(prompt: string, options: RunMediaPromptOptions, initialJobId?: string | null) {
  const response = await fetchMediaChat(prompt, options.signal, options.model)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const outputUrls = new Set<string>()
  let buffer = ''
  let jobId: string | null = initialJobId ?? null
  let hasAssistantDelta = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventText of events) {
      const parsedEvent = parseSseEvent(eventText)
      if (!parsedEvent) continue
      if (parsedEvent.data === '[DONE]') continue

      let payload: MediaChatEventPayload
      try {
        payload = JSON.parse(parsedEvent.data) as MediaChatEventPayload
      } catch {
        payload = { message: parsedEvent.data }
      }

      jobId = jobId ?? jobIdFromPayload(payload)
      outputUrlsFromChatPayload(payload).forEach((url) => outputUrls.add(url))

      if (parsedEvent.event === 'error') {
        throw new Error(messageFromChatEvent(parsedEvent.event, payload) ?? 'Media chat stream failed.')
      }

      const message = messageFromChatEvent(parsedEvent.event, payload)
      if (!message) continue

      if (parsedEvent.event === 'assistant_delta') {
        hasAssistantDelta = true
        options.onProgress?.({
          event: parsedEvent.event,
          message,
          jobId: jobId ?? undefined,
          mode: 'append',
        })
        continue
      }

      if (parsedEvent.event === 'assistant_message' && hasAssistantDelta) {
        continue
      }

      options.onProgress?.({
        event: parsedEvent.event,
        message,
        jobId: jobId ?? undefined,
        mode: 'line',
      })
    }
  }

  return {
    jobId,
    outputUrls: Array.from(outputUrls),
  }
}

export async function runMediaPrompt(prompt: string, options: RunMediaPromptOptions = {}): Promise<MediaPromptResult> {
  // TEMPORARY: only create + poll the job (POST /jobs). The /chat streaming path
  // (streamChatForJob/fetchMediaChat) is disabled for now — re-enable it when the
  // chat-driven generation is ready.
  const jobId = await createMediaJob(prompt, options.signal, options.model)
  if (!jobId) {
    throw new Error('Media job creation did not return a job_id.')
  }

  let lastStatus: string | undefined

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await fetchJobStatus(jobId, options.signal)
    if (status.error) {
      throw new Error(status.error)
    }

    if (isTerminalFailure(status.status)) {
      throw new Error(`Media job ${jobId} ${status.status}.`)
    }

    if (isTerminalSuccess(status.status)) {
      const outputUrls = status.result ? outputUrlsFromResult(status.result) : []
      if (outputUrls.length === 0) {
        throw new Error('Media job completed without output_urls.')
      }

      return {
        jobId,
        outputUrls,
      }
    }

    lastStatus = status.status

    await wait(1000, options.signal)
  }

  throw new Error(`Media job ${jobId} timed out.`)
}
