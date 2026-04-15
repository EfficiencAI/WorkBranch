/*
  Node.js for Mobile Apps Cordova plugin.

  The JNI layer between the Cordova plugin Java code and the Node.js bridge.
 */

#include <jni.h>
#include <string>
#include <stdlib.h>
#include <cstdlib>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>

#include "node.h"
#include "cordova-bridge.h"

const char *ADBTAG = "NODEJS-MOBILE";

int start_redirecting_stdout_stderr();

JNIEnv* cacheEnvPointer = NULL;

extern "C"
JNIEXPORT void JNICALL
Java_com_workbranch_app_NodeService_sendMessageToNodeChannel(
    JNIEnv *env,
    jobject /* this */,
    jstring channelName,
    jstring msg) {
  const char* nativeChannelName = env->GetStringUTFChars(channelName, 0);
  const char* nativeMessage = env->GetStringUTFChars(msg, 0);
  SendMessageToNodeChannel(nativeChannelName, nativeMessage);
  env->ReleaseStringUTFChars(channelName, nativeChannelName);
  env->ReleaseStringUTFChars(msg, nativeMessage);
}

extern "C"
JNIEXPORT void JNICALL
Java_com_workbranch_app_NodeService_registerNodeDataDirPath(
    JNIEnv *env,
    jobject /* this */,
    jstring dataDir) {
  const char* nativeDataDir = env->GetStringUTFChars(dataDir, 0);
  RegisterNodeDataDirPath(nativeDataDir);
  env->ReleaseStringUTFChars(dataDir, nativeDataDir);
}

extern "C" int callintoNode(int argc, char *argv[]){
  const int exit_code = node::Start(argc,argv);
  return exit_code;
}

#if defined(__arm__)
  #define CURRENT_ABI_NAME "armeabi-v7a"
#elif defined(__aarch64__)
  #define CURRENT_ABI_NAME "arm64-v8a"
#elif defined(__i386__)
  #define CURRENT_ABI_NAME "x86"
#elif defined(__x86_64__)
  #define CURRENT_ABI_NAME "x86_64"
#else
  #error "Trying to compile for an unknown ABI."
#endif

extern "C"
JNIEXPORT jstring JNICALL
Java_com_workbranch_app_NodeService_getCurrentABIName(
    JNIEnv *env,
    jobject /* this */) {
    return env->NewStringUTF(CURRENT_ABI_NAME);
}

void rcv_message_from_node(const char* channel_name, const char* msg) {
  JNIEnv *env = cacheEnvPointer;
  if (!env) {
    return;
  }
  jclass cls2 = env->FindClass("com/workbranch/app/NodeService");
  if (cls2 != nullptr) {
    jmethodID m_sendMessage = env->GetStaticMethodID(cls2,
                                                     "sendMessageToApplication",
                                                     "(Ljava/lang/String;Ljava/lang/String;)V");
    if (m_sendMessage != nullptr) {
      jstring java_channel_name=env->NewStringUTF(channel_name);
      jstring java_msg=env->NewStringUTF(msg);
      env->CallStaticVoidMethod(cls2, m_sendMessage, java_channel_name, java_msg);
      env->DeleteLocalRef(java_channel_name);
      env->DeleteLocalRef(java_msg);
    }
    env->DeleteLocalRef(cls2);
  }
}

extern "C" jint JNICALL
Java_com_workbranch_app_NodeService_startNodeWithArguments(
    JNIEnv *env,
    jobject /* this */,
    jobjectArray arguments,
    jstring nodePath,
    jboolean redirectOutputToLogcat) {

  const char* path_path = env->GetStringUTFChars(nodePath, 0);
  setenv("NODE_PATH", path_path, 1);
  env->ReleaseStringUTFChars(nodePath, path_path);

  jsize argument_count = env->GetArrayLength(arguments);

  int c_arguments_size = 0;
  for (int i = 0; i < argument_count ; i++) {
    jstring n_arg = (jstring)env->GetObjectArrayElement(arguments, i);
    const char* n_arg_contents = env->GetStringUTFChars(n_arg, 0);
    c_arguments_size += strlen(n_arg_contents);
    c_arguments_size++;
    env->ReleaseStringUTFChars(n_arg, n_arg_contents);
    env->DeleteLocalRef(n_arg);
  }

  char* args_buffer = (char*)calloc(c_arguments_size, sizeof(char));

  char* argv[argument_count];

  char* current_args_position = args_buffer;

  for (int i = 0; i < argument_count ; i++) {
    jstring n_arg = (jstring)env->GetObjectArrayElement(arguments, i);
    const char* current_argument = env->GetStringUTFChars(n_arg, 0);

    strncpy(current_args_position, current_argument, strlen(current_argument));

    env->ReleaseStringUTFChars(n_arg, current_argument);
    env->DeleteLocalRef(n_arg);

    argv[i] = current_args_position;

    current_args_position += strlen(current_args_position)+1;
  }

  if (redirectOutputToLogcat == true) {
    if (start_redirecting_stdout_stderr() == -1) {
      __android_log_write(ANDROID_LOG_ERROR, ADBTAG, "Couldn't start redirecting stdout and stderr to logcat.");
    }
  }

  RegisterBridgeCallback(&rcv_message_from_node);

  cacheEnvPointer = env;

  return jint(callintoNode(argument_count, argv));
}

int pipe_stdout[2];
int pipe_stderr[2];
pthread_t thread_stdout;
pthread_t thread_stderr;

void redirect(int pipe, int log_level) {
  ssize_t redirect_size;
  char buf[2048];
  while ((redirect_size = read(pipe, buf, sizeof buf - 1)) > 0) {
    if (buf[redirect_size - 1] == '\n') {
      --redirect_size;
    }
    buf[redirect_size] = 0;
    __android_log_write(log_level, ADBTAG, buf);
  }
}

void* thread_stderr_func(void*) {
  redirect(pipe_stderr[0], ANDROID_LOG_ERROR);
  return 0;
}

void* thread_stdout_func(void*) {
  redirect(pipe_stdout[0], ANDROID_LOG_INFO);
  return 0;
}

int start_redirecting_stdout_stderr() {
  setvbuf(stdout, 0, _IONBF, 0);
  pipe(pipe_stdout);
  dup2(pipe_stdout[1], STDOUT_FILENO);

  setvbuf(stderr, 0, _IONBF, 0);
  pipe(pipe_stderr);
  dup2(pipe_stderr[1], STDERR_FILENO);

  if (pthread_create(&thread_stdout, 0, thread_stdout_func, 0) == -1) {
    return -1;
  }
  pthread_detach(thread_stdout);

  if(pthread_create(&thread_stderr, 0, thread_stderr_func, 0) == -1) {
    return -1;
  }
  pthread_detach(thread_stderr);

  return 0;
}
